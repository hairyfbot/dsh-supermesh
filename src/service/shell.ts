import type { Context } from '@deepseek-ai/cordis'
import type { ShellEnvRegistry } from '@deepseek-ai/dsh-shell-env'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'
import { getServerContext } from 'dsh-h3/utils'
import { DSH_PLUGIN_HOME } from '@/config/paths'
import { db } from '@/database'
import { server } from '@/server'
import { channel } from '@/service/channel'
import { session } from '@/service/session'
import { defineService } from '@/utils/service'

const directory = join(DSH_PLUGIN_HOME, 'cli')
const bin = join(directory, 'bin')
const gitconfig = join(directory, 'gitconfig')
const tokens = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'GITLAB_TOKEN',
  'GLAB_TOKEN',
  'OAUTH_TOKEN',
  'CI_JOB_TOKEN',
]
const identities = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
]
/** 角色会话标记：由 `ctx.shellEnv` 按调用会话注入，shim 只在这个变量存在时才切到 bot 身份。 */
const ROLE_MARKER = 'DSH_SUPERMESH_ROLE'
let restore: (() => void) | undefined
let writing: Promise<unknown> = Promise.resolve()
let basePath = ''

export const shell = defineService({
  async start(): Promise<() => Promise<void>> {
    if (restore)
      throw new Error('shell_already_started')
    basePath = (process.env.PATH ?? '').split(delimiter).filter(path => resolve(path).toLowerCase() !== resolve(bin).toLowerCase()).join(delimiter)
    await refresh()
    // bot 身份只发给插件的四个角色会话：shim 靠这个标记决定是否切到 bot 凭据与 gitconfig。
    // 宿主里其它会话拿不到标记，gh / git 的行为与没装插件时一致。
    // 走 `ctx.get` 而不是 `ctx.shellEnv`：后者要求插件把 shellEnv 写进 inject，
    // 而缺这个服务的 profile 会因此整块停用。没有注册表时退化为「没有角色标记」，
    // shim 全部原样 exec 真实 CLI。
    const registry = getServerContext<Context>(server).get('shellEnv') as ShellEnvRegistry | undefined
    const release = registry?.register({
      name: 'supermesh-role',
      variables: { DSH_SUPERMESH_ROLE: { description: 'Supermesh 角色会话标记，决定 gh / glab / git 是否使用插件的机器人身份。' } },
      resolve: (execution) => {
        const agent = execution.agent
        const role = agent ? session.roleOf(agent) : null
        return role ? { DSH_SUPERMESH_ROLE: role } : {}
      },
    })
    // 只把 shim 目录挂到 PATH：shim 在没有角色标记时原样 exec 真实 CLI，
    // 所以宿主里其它会话看到的 gh/git 行为与没有插件时完全一致。
    const previous = process.env.PATH
    process.env.PATH = [bin, basePath].join(delimiter)
    restore = () => {
      release?.()
      if (previous === undefined)
        delete process.env.PATH
      else
        process.env.PATH = previous
    }
    return async () => {
      const release = restore
      restore = undefined
      release?.()
      await writing
    }
  },
  commandEnvironment(): NodeJS.ProcessEnv {
    return { ...process.env }
  },
  refresh(): Promise<void> {
    if (!restore)
      return Promise.resolve()
    const next = writing.then(refresh)
    writing = next.catch(() => undefined)
    return next
  },
})

async function refresh(): Promise<void> {
  const [github, gitlab, views, projects] = await Promise.all([channel.connection('github'), channel.connection('gitlab'), channel.list(), db.project.listAll()])
  await Promise.all([bin, join(directory, 'gh'), join(directory, 'glab')].map(path => mkdir(path, { recursive: true, mode: 0o700 })))
  const gitlabSite = new URL(gitlab.host ?? 'https://gitlab.com')
  const gitlabHost = gitlabSite.host
  const bot = (kind: string) => views.find(view => view.id === kind)?.accounts.find(account => account.role === 'bot')?.name ?? ''
  await own(join(directory, 'gh', 'hosts.yml'), JSON.stringify(github.enabled && github.token ? { 'github.com': { oauth_token: github.token, user: bot('github'), git_protocol: 'https' } } : {}))
  // glab 的 git_protocol 只接受 ssh|https，纯 HTTP 站点靠下面的 gitconfig insteadOf 落到实际协议。
  await own(join(directory, 'glab', 'config.yml'), JSON.stringify({ git_protocol: 'https', hosts: gitlab.enabled && gitlab.token ? { [gitlabHost]: { token: gitlab.token, user: bot('gitlab'), api_protocol: gitlabSite.protocol.slice(0, -1), git_protocol: 'https' } } : {} }))
  const shellPath = shellPathOf(basePath)
  for (const cli of ['gh', 'glab'] as const) {
    const executable = await nativeCli(cli)
    const configKey = cli === 'gh' ? 'GH_CONFIG_DIR' : 'GLAB_CONFIG_DIR'
    const hostKey = cli === 'gh' ? 'GH_HOST' : 'GITLAB_HOST'
    const host = cli === 'gh' ? 'github.com' : gitlabHost
    // glab 的 keyring 不理会 GLAB_CONFIG_DIR，会读到系统里的个人 token；
    // 强制文件存储，保证包装器只认本目录下这份 bot 凭据。
    const keyringKeys = cli === 'glab' ? ['GLAB_USE_KEYRING'] : []
    const botEnv = [
      ...tokens.map(key => `unset ${key}`),
      `export PATH=${quote(shellPath)}`,
      `export ${configKey}=${quote(join(directory, cli).replaceAll('\\', '/'))}`,
      `export ${hostKey}=${quote(host)}`,
      ...keyringKeys.map(key => `export ${key}=false`),
    ]
    await own(join(bin, cli), ['#!/bin/sh', `if [ -z "$${ROLE_MARKER}" ]; then exec ${executable ? quote(executable.replaceAll('\\', '/')) : 'exit 127'} "$@"; fi`, ...botEnv, executable ? `exec ${quote(executable.replaceAll('\\', '/'))} "$@"` : `echo '${cli} is not installed' >&2; exit 127`, ''].join('\n'), 0o700)
    const cmd = (value: string) => value.replaceAll('%', '%%')
    const botCmd = [
      ...tokens.map(key => `set "${key}="`),
      `set "PATH=${cmd(basePath)}"`,
      `set "${configKey}=${cmd(join(directory, cli))}"`,
      `set "${hostKey}=${host}"`,
      ...keyringKeys.map(key => `set "${key}=false"`),
    ]
    await own(join(bin, `${cli}.cmd`), ['@echo off', 'setlocal', `if not defined ${ROLE_MARKER} goto plain`, ...botCmd, executable ? `"${cmd(executable)}" %*` : `echo ${cli} is not installed 1>&2 & exit /b 127`, 'exit /b %errorlevel%', ':plain', executable ? `"${cmd(executable)}" %*` : `echo ${cli} is not installed 1>&2 & exit /b 127`, 'exit /b %errorlevel%', ''].join('\r\n'), 0o700)
  }
  const nativeGh = await nativeCli('gh')
  const escaping = ['GH_CONFIG_DIR', 'GH_HOST', ...tokens]
  await own(join(bin, 'gh-default'), ['#!/bin/sh', `if [ -z "$${ROLE_MARKER}" ]; then exec ${nativeGh ? quote(nativeGh.replaceAll('\\', '/')) : 'exit 127'} "$@"; fi`, ...escaping.map(key => `unset ${key}`), `export PATH=${quote(shellPath)}`, nativeGh ? `exec ${quote(nativeGh.replaceAll('\\', '/'))} "$@"` : 'echo gh is not installed >&2; exit 127', ''].join('\n'), 0o700)
  await own(join(bin, 'gh-default.cmd'), ['@echo off', 'setlocal', `if not defined ${ROLE_MARKER} goto plain`, ...escaping.map(key => `set "${key}="`), `set "PATH=${basePath.replaceAll('%', '%%')}"`, nativeGh ? `"${nativeGh.replaceAll('%', '%%')}" %*` : 'echo gh is not installed 1>&2 & exit /b 127', 'exit /b %errorlevel%', ':plain', nativeGh ? `"${nativeGh.replaceAll('%', '%%')}" %*` : 'echo gh is not installed 1>&2 & exit /b 127', 'exit /b %errorlevel%', ''].join('\r\n'), 0o700)
  // git 不再靠全局 GIT_CONFIG_GLOBAL 劫持：角色会话经这个 shim 拿到 bot 的 gitconfig，
  // 其它会话原样 exec 真实 git，读自己的全局配置。
  const nativeGit = await nativeCli('git')
  const gitQuote = (value: string) => JSON.stringify(value)
  const gitEnv = [
    ...identities.map(key => `unset ${key}`),
    `export GIT_CONFIG_GLOBAL=${quote(gitconfig.replaceAll('\\', '/'))}`,
    'export GIT_CONFIG_NOSYSTEM=1',
    'export GIT_ASKPASS=',
    'export GIT_TERMINAL_PROMPT=0',
  ]
  await own(join(bin, 'git'), ['#!/bin/sh', `if [ -z "$${ROLE_MARKER}" ]; then exec ${nativeGit ? quote(nativeGit.replaceAll('\\', '/')) : 'exit 127'} "$@"; fi`, ...gitEnv, nativeGit ? `exec ${quote(nativeGit.replaceAll('\\', '/'))} "$@"` : 'echo git is not installed >&2; exit 127', ''].join('\n'), 0o700)
  await own(join(bin, 'git.cmd'), ['@echo off', 'setlocal', `if not defined ${ROLE_MARKER} goto plain`, ...identities.map(key => `set "${key}="`), `set "GIT_CONFIG_GLOBAL=${gitconfig.replaceAll('%', '%%')}"`, 'set "GIT_CONFIG_NOSYSTEM=1"', 'set "GIT_ASKPASS="', 'set "GIT_TERMINAL_PROMPT=0"', nativeGit ? `"${nativeGit.replaceAll('%', '%%')}" %*` : 'echo git is not installed 1>&2 & exit /b 127', 'exit /b %errorlevel%', ':plain', nativeGit ? `"${nativeGit.replaceAll('%', '%%')}" %*` : 'echo git is not installed 1>&2 & exit /b 127', 'exit /b %errorlevel%', ''].join('\r\n'), 0o700)
  const cliPath = (cli: string) => quote(join(bin, cli).replaceAll('\\', '/'))
  const lines = [
    '[user]',
    '\tuseConfigOnly = true',
    '[credential]',
    '\thelper =',
    '[credential "https://github.com"]',
    `\thelper = ${gitQuote(`!${cliPath('gh')} auth git-credential`)}`,
    `[credential "${gitlabSite.origin}"]`,
    `\thelper = ${gitQuote(`!f() { if test "$1" = get; then token=$( ${cliPath('glab')} config get token --host ${quote(gitlabHost)} ) || exit; test -n "$token" || exit; printf 'username=oauth2\\npassword=%s\\n' "$token"; fi; }; f`)}`,
    '[url "https://github.com/"]',
    '\tinsteadOf = git@github.com:',
    '\tinsteadOf = ssh://git@github.com/',
    `[url "${gitlabSite.origin}/"]`,
    `\tinsteadOf = git@${gitlabHost}:`,
    `\tinsteadOf = ssh://git@${gitlabHost}/`,
    '[filter "lfs"]',
    '\tclean = git-lfs clean -- %f',
    '\tsmudge = git-lfs smudge -- %f',
    '\tprocess = git-lfs filter-process',
    '\trequired = true',
  ]
  for (const project of projects) {
    if (!project.remoteUrl)
      continue
    const metadata = views.find(view => view.id === (/github\.com[:/]/i.test(project.remoteUrl!) ? 'github' : 'gitlab'))
    if (!metadata?.commitName || !metadata.commitEmail)
      continue
    const identity = join(directory, `${project.id}.gitconfig`)
    await own(identity, `[user]\n\tname = ${gitQuote(metadata.commitName)}\n\temail = ${gitQuote(metadata.commitEmail)}\n`)
    const repositoryGitdir = join(project.directory, '.git').replaceAll('\\', '/')
    for (const pattern of [repositoryGitdir, `${repositoryGitdir}/`])
      lines.push(`[includeIf ${gitQuote(`gitdir/i:${pattern}`)}]`, `\tpath = ${gitQuote(identity)}`)
  }
  await own(gitconfig, `${lines.join('\n')}\n`)
}

function shellPathOf(value: string): string {
  if (process.platform !== 'win32')
    return value
  return value.split(delimiter).map(path => path.replaceAll('\\', '/').replace(/^([a-z]):/i, (_, drive: string) => `/${drive.toLowerCase()}`)).join(':')
}

async function nativeCli(cli: string): Promise<string | undefined> {
  for (const folder of basePath.split(delimiter)) {
    if (!folder)
      continue
    const executable = join(folder, process.platform === 'win32' ? `${cli}.exe` : cli)
    try {
      await access(executable)
      return executable
    }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
        throw error
    }
  }
}

async function own(path: string, content: string, mode = 0o600): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, content, { mode })
  await rename(temporary, path)
}

function quote(value: string): string {
  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}
