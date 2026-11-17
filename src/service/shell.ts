import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'
import { DSH_PLUGIN_HOME } from '../config/paths'
import { db } from '../database'
import { defineService } from '../utils/service'
import { channel } from './channel'

const directory = join(DSH_PLUGIN_HOME, 'cli')
const bin = join(directory, 'bin')
const gitconfig = join(directory, 'gitconfig')
const removed = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
  'GITLAB_TOKEN',
  'GLAB_TOKEN',
  'OAUTH_TOKEN',
  'CI_JOB_TOKEN',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'SSH_ASKPASS',
]
let restore: (() => void) | undefined
let writing: Promise<unknown> = Promise.resolve()
let basePath = ''

export const shell = defineService({
  async start(): Promise<() => Promise<void>> {
    if (restore)
      throw new Error('shell_already_started')
    basePath = (process.env.PATH ?? '').split(delimiter).filter(path => resolve(path).toLowerCase() !== resolve(bin).toLowerCase()).join(delimiter)
    await refresh()
    const values: Record<string, string | undefined> = {
      ...Object.fromEntries(removed.map(key => [key, undefined])),
      PATH: [bin, basePath].join(delimiter),
      GIT_CONFIG_GLOBAL: gitconfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_ASKPASS: '',
      GIT_TERMINAL_PROMPT: '0',
    }
    const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
    const apply = (entries: Record<string, string | undefined>) => {
      for (const [key, value] of Object.entries(entries)) {
        if (value === undefined)
          delete process.env[key]
        else
          process.env[key] = value
      }
    }
    apply(values)
    restore = () => apply(previous)
    return async () => {
      const release = restore
      restore = undefined
      release?.()
      await writing
    }
  },
  commandEnvironment(): NodeJS.ProcessEnv {
    return { ...process.env, ...(restore ? { PATH: basePath } : {}) }
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
  const gitlabHost = new URL(gitlab.host ?? 'https://gitlab.com').host
  const bot = (kind: string) => views.find(view => view.id === kind)?.accounts.find(account => account.role === 'bot')?.name ?? ''
  await own(join(directory, 'gh', 'hosts.yml'), JSON.stringify(github.enabled && github.token ? { 'github.com': { oauth_token: github.token, user: bot('github'), git_protocol: 'https' } } : {}))
  await own(join(directory, 'glab', 'config.yml'), JSON.stringify({ git_protocol: 'https', hosts: gitlab.enabled && gitlab.token ? { [gitlabHost]: { token: gitlab.token, user: bot('gitlab'), api_protocol: 'https', git_protocol: 'https' } } : {} }))
  for (const cli of ['gh', 'glab'] as const) {
    const executable = await nativeCli(cli)
    const configKey = cli === 'gh' ? 'GH_CONFIG_DIR' : 'GLAB_CONFIG_DIR'
    const hostKey = cli === 'gh' ? 'GH_HOST' : 'GITLAB_HOST'
    const host = cli === 'gh' ? 'github.com' : gitlabHost
    const shellPath = shellPathOf(basePath)
    await own(join(bin, cli), ['#!/bin/sh', `unset ${removed.filter(key => /TOKEN/.test(key)).join(' ')}`, `export PATH=${quote(shellPath)}`, `export ${configKey}=${quote(join(directory, cli).replaceAll('\\', '/'))}`, `export ${hostKey}=${quote(host)}`, executable ? `exec ${quote(executable.replaceAll('\\', '/'))} "$@"` : `echo '${cli} is not installed' >&2; exit 127`, ''].join('\n'), 0o700)
    const cmd = (value: string) => value.replaceAll('%', '%%')
    await own(join(bin, `${cli}.cmd`), ['@echo off', 'setlocal', ...removed.filter(key => /TOKEN/.test(key)).map(key => `set "${key}="`), `set "PATH=${cmd(basePath)}"`, `set "${configKey}=${cmd(join(directory, cli))}"`, `set "${hostKey}=${host}"`, executable ? `"${cmd(executable)}" %*` : `echo ${cli} is not installed 1>&2 & exit /b 127`, 'exit /b %errorlevel%', ''].join('\r\n'), 0o700)
  }
  const nativeGh = await nativeCli('gh')
  const escaping = ['GH_CONFIG_DIR', 'GH_HOST', ...removed.filter(key => /TOKEN/.test(key))]
  await own(join(bin, 'gh-default'), ['#!/bin/sh', `unset ${escaping.join(' ')}`, `export PATH=${quote(shellPathOf(basePath))}`, nativeGh ? `exec ${quote(nativeGh.replaceAll('\\', '/'))} "$@"` : 'echo gh is not installed >&2; exit 127', ''].join('\n'), 0o700)
  await own(join(bin, 'gh-default.cmd'), ['@echo off', 'setlocal', ...escaping.map(key => `set "${key}="`), `set "PATH=${basePath.replaceAll('%', '%%')}"`, nativeGh ? `"${nativeGh.replaceAll('%', '%%')}" %*` : 'echo gh is not installed 1>&2 & exit /b 127', 'exit /b %errorlevel%', ''].join('\r\n'), 0o700)
  const gitQuote = (value: string) => JSON.stringify(value)
  const cliPath = (cli: string) => quote(join(bin, cli).replaceAll('\\', '/'))
  const lines = [
    '[user]',
    '\tuseConfigOnly = true',
    '[credential]',
    '\thelper =',
    '[credential "https://github.com"]',
    `\thelper = ${gitQuote(`!${cliPath('gh')} auth git-credential`)}`,
    `[credential "https://${gitlabHost}"]`,
    `\thelper = ${gitQuote(`!f() { if test "$1" = get; then token=$( ${cliPath('glab')} config get token --host ${quote(gitlabHost)} ) || exit; test -n "$token" || exit; printf 'username=oauth2\\npassword=%s\\n' "$token"; fi; }; f`)}`,
    '[url "https://github.com/"]',
    '\tinsteadOf = git@github.com:',
    '\tinsteadOf = ssh://git@github.com/',
    `[url "https://${gitlabHost}/"]`,
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
