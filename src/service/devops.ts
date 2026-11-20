import type { Context } from '@deepseek-ai/cordis'
import type { Buffer } from 'node:buffer'
import type { ChannelConfiguration, ChannelView } from '@/service/channel.types'
import type { ChannelAuthentication } from '@/service/devops.types'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { StringDecoder } from 'node:string_decoder'
import { stripVTControlCharacters } from 'node:util'
import { createRouteDispatcher } from '@deepseek-ai/dsh-http-proxy'
import { getServerContext } from 'dsh-h3/utils'
import { fetch } from 'undici'
import { channelProxyEnvironment } from '@/channel/_shared/proxy'
import { DSH_PLUGIN_HOME } from '@/config/paths'
import { db } from '@/database'
import { server } from '@/server'
import { channel } from '@/service/channel'
import { shell } from '@/service/shell'
import { noreplyEmail } from '@/utils/git-identity'
import { defineService } from '@/utils/service'

interface Authentication {
  view: ChannelAuthentication
  controller: AbortController
  done: Promise<void>
  finishedAt?: number
  origin?: string
  networkTimeout?: boolean
}

const authentications = new Map<string, Authentication>()
const active = new Map<string, Authentication>()
const lifetime = 10 * 60 * 1000

export const devops = defineService({
  async start(channelId: string, host?: string): Promise<ChannelAuthentication> {
    if (channelId !== 'github' && channelId !== 'gitlab')
      throw new TypeError('channel_unsupported')
    const origin = host !== undefined ? site(channelId, host) : channelId === 'github' ? 'https://github.com' : undefined
    const pending = active.get(channelId)
    if (pending) {
      if (origin && pending.origin && origin !== pending.origin)
        throw new Error('channel_auth_in_progress')
      return snapshot(pending)
    }
    prune()
    const task: Authentication = {
      view: { id: randomUUID(), channelId, status: 'pending', output: channelId === 'github' ? 'Waiting for GitHub authorization.' : 'Waiting for GitLab device authorization (GitLab 17.9+).' },
      origin,
      controller: new AbortController(),
      done: Promise.resolve(),
    }
    const ctx = getServerContext<Context>(server)
    const dispose = ctx.effect(() => () => cancel(task), 'supermesh:devops')
    authentications.set(task.view.id, task)
    active.set(channelId, task)
    task.done = Promise.resolve().then(() => authenticate(task)).finally(() => {
      active.delete(channelId)
      task.finishedAt = Date.now()
    })
    void task.done.then(() => dispose())
    return snapshot(task)
  },
  lookup(channelId: string, authenticationId: string): ChannelAuthentication | null {
    prune()
    const task = authentications.get(authenticationId)
    return task?.view.channelId === channelId ? snapshot(task) : null
  },
  async cancel(channelId: string): Promise<void> {
    if (channelId !== 'github' && channelId !== 'gitlab')
      throw new TypeError('channel_unsupported')
    const pending = active.get(channelId)
    if (pending)
      await cancel(pending)
  },
  async cleanup(): Promise<void> {
    await Promise.all([...active.values()].map(cancel))
  },
  save(kind: string, patch: ChannelConfiguration): Promise<ChannelView> {
    return channel.serialize(() => save(kind, patch)).then(async (view) => {
      const { shell } = await import('@/service/shell')
      await shell.refresh()
      return view
    })
  },
  removeCredentials(kind: string): Promise<ChannelView> {
    return channel.serialize(() => removeCredentials(kind)).then(async (view) => {
      const { shell } = await import('@/service/shell')
      await shell.refresh()
      return view
    })
  },
})

async function removeCredentials(kind: string): Promise<ChannelView> {
  if (kind !== 'github' && kind !== 'gitlab')
    throw new TypeError('channel_unsupported')
  const previous = await channel.clearCredential(kind)
  try {
    await db.channel.removeCredentials(kind)
  }
  catch {
    if (previous)
      await channel.storeCredential(kind, previous)
    throw new Error('channel_credentials_delete_failed')
  }
  return (await channel.list()).find(item => item.kind === kind)!
}

async function save(kind: string, patch: ChannelConfiguration): Promise<ChannelView> {
  if (kind !== 'github' && kind !== 'gitlab')
    throw new TypeError('channel_unsupported')
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['host', 'enabled', 'commitName', 'commitEmail', 'token'].includes(key)) || (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') || ['host', 'commitName', 'commitEmail', 'token'].some(key => patch[key as keyof ChannelConfiguration] !== undefined && typeof patch[key as keyof ChannelConfiguration] !== 'string'))
    throw new TypeError('invalid_channel_config')
  if (patch.token !== undefined && (!patch.token.trim() || patch.token.length > 8192 || /[\r\n]/.test(patch.token)))
    throw new TypeError('invalid_channel_token')
  if ((patch.commitName?.length ?? 0) > 200 || (patch.commitEmail?.length ?? 0) > 254 || /[\r\n]/.test((patch.commitName ?? '') + (patch.commitEmail ?? '')) || (patch.commitEmail && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(patch.commitEmail.trim())))
    throw new TypeError('invalid_commit_identity')
  const current = (await channel.list()).find(item => item.kind === kind)!
  let url: URL
  try {
    url = new URL(patch.host ?? current.host ?? (kind === 'github' ? 'https://github.com' : 'https://gitlab.com'))
  }
  catch {
    throw new TypeError('invalid_channel_host')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (kind === 'github' && url.origin !== 'https://github.com'))
    throw new TypeError('invalid_channel_host')
  const hostChanged = kind === 'gitlab' && url.origin !== new URL(current.host ?? 'https://gitlab.com').origin
  const token = patch.token?.trim()
  let account: { name: string, avatar: string | null, providerId: string } | undefined
  if (hostChanged && (current.hasCredential || current.accounts.length > 0) && !token)
    throw new TypeError('channel_account_required')
  if (token)
    account = await verify(kind, url, token)
  const enabled = patch.enabled ?? (Boolean(account) || current.enabled)
  if (enabled && !account && !current.accounts.some(account => account.role === 'bot' && account.status === 'online'))
    throw new TypeError('channel_account_required')
  // 老配置没存账号 id：编辑提交身份时用已存凭据补验一次，才拿得到正确的 noreply 默认值。
  let identity = account
  if (!identity && !current.providerId && (patch.commitName !== undefined || patch.commitEmail !== undefined)) {
    const stored = await channel.resolveCredential(kind)
    if (stored)
      identity = await verify(kind, url, stored).catch(() => undefined)
  }
  const providerId = identity?.providerId ?? current.providerId
  const login = identity?.name ?? current.accounts.find(account => account.role === 'bot')?.name ?? ''
  // 平台按邮箱归属提交：没填邮箱时直接落成账号的 noreply 地址，避免 bot 的提交记到人头上。
  // 显式清空也走默认值，否则用户没法把填错的个人邮箱退回默认。
  const requested = patch.commitEmail?.trim() ?? current.commitEmail
  const commitEmail = requested || noreplyEmail(kind, login, providerId, url.origin)
  const previous = token ? await channel.storeCredential(kind, token) : undefined
  try {
    await db.channel.saveConfiguration(kind, current.name, kind === 'gitlab' ? url.origin : null, enabled, { commitName: patch.commitName?.trim() ?? current.commitName, commitEmail, providerId }, account, ...(hostChanged ? [true] as const : []))
  }
  catch {
    if (token) {
      if (previous)
        await channel.storeCredential(kind, previous)
      else
        await channel.clearCredential(kind)
    }
    throw new Error('channel_save_failed')
  }
  return (await channel.list()).find(item => item.kind === kind)!
}

async function verify(kind: 'github' | 'gitlab', url: URL, token: string): Promise<{ name: string, avatar: string | null, providerId: string }> {
  const endpoint = kind === 'github' ? 'https://api.github.com/user' : `${url.origin}/api/v4/user`
  const env = await channelProxyEnvironment(new URL(endpoint), process.env)
  const dispatcher = await createRouteDispatcher({ get: name => env[name] === undefined ? undefined : { value: env[name] } }, { allowH2: false })
  try {
    let response: Awaited<ReturnType<typeof fetch>>
    try {
      response = await fetch(endpoint, { dispatcher, headers: { authorization: `Bearer ${token}`, accept: kind === 'github' ? 'application/vnd.github+json' : 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' })
    }
    catch {
      throw new Error('channel_verification_failed')
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error('channel_auth_failed')
    }
    let identity: unknown
    try {
      identity = await response.json()
    }
    catch {
      throw new Error('channel_auth_failed')
    }
    if (!identity || typeof identity !== 'object' || Array.isArray(identity))
      throw new Error('channel_auth_failed')
    const user = identity as Record<string, unknown>
    const login = kind === 'github' ? user.login : user.username ?? user.name
    if (typeof login !== 'string' || !login.trim() || login.length > 200 || /[\r\n]/.test(login))
      throw new Error('channel_auth_failed')
    const id = user.id
    if (typeof id !== 'number' && typeof id !== 'string')
      throw new Error('channel_auth_failed')
    const providerId = String(id)
    if (!/^\d+$/.test(providerId))
      throw new Error('channel_auth_failed')
    return { name: login.trim(), avatar: null, providerId }
  }
  finally {
    await dispatcher.close()
  }
}

function snapshot(task: Authentication): ChannelAuthentication {
  return { ...task.view, ...(task.view.account ? { account: { ...task.view.account } } : {}) }
}

function prune(): void {
  for (const [id, task] of authentications) {
    if (task.finishedAt && (Date.now() - task.finishedAt > lifetime || authentications.size >= 32))
      authentications.delete(id)
  }
}

async function cancel(task: Authentication): Promise<void> {
  if (!task.finishedAt)
    task.controller.abort()
  await task.done
}

async function authenticate(task: Authentication): Promise<void> {
  const directory = join(DSH_PLUGIN_HOME, `${task.view.channelId}-auth`, task.view.id)
  let env = Object.fromEntries(Object.entries(shell.commandEnvironment()).filter(([key]) => key === 'GITLAB_CLIENT_ID' || !/^(?:GH_|GITHUB_|GLAB_|GITLAB_|OAUTH_TOKEN$|CI_JOB_TOKEN$|GL_HOST$|BROWSER$|API_PROTOCOL$|SKIP_TLS_VERIFY$|NO_PROMPT$|PROMPT_DISABLED$)/i.test(key)))
  env.GH_CONFIG_DIR = directory
  env.GLAB_CONFIG_DIR = directory
  env.GH_HOST = 'github.com'
  env.GH_BROWSER = `"${process.execPath.replaceAll('\\', '/')}" -e "process.exit(0)"`
  env.ELECTRON_RUN_AS_NODE = '1'
  env.GLAB_BROWSER = env.GH_BROWSER
  env.GLAB_CHECK_UPDATE = 'false'
  env.GLAB_SKIP_TLS_VERIFY = 'false'
  env.GLAB_API_PROTOCOL = 'https'
  // glab 的 keyring 不理会 GLAB_CONFIG_DIR：登录后 token 进系统 keyring，
  // 后续 `glab config get token` 会读到全局个人 token 而不是刚登录的 bot，
  // 导致凭据落库成错的身份。强制走文件存储才能按目录隔离。
  env.GLAB_USE_KEYRING = 'false'
  env.GH_PAGER = 'cat'
  env.NO_COLOR = '1'
  const timeout = setTimeout(() => task.controller.abort(), lifetime)
  timeout.unref()
  try {
    task.controller.signal.throwIfAborted()
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (!task.origin)
      task.origin = site(task.view.channelId, (await channel.list()).find(item => item.id === task.view.channelId)?.host ?? 'https://gitlab.com')
    env = await channelProxyEnvironment(new URL(task.origin), env)
    const hostname = new URL(task.origin).host
    const args = task.view.channelId === 'github'
      ? ['auth', 'login', '--hostname', hostname, '--git-protocol', 'https', '--web', '--insecure-storage']
      : ['auth', 'login', '--hostname', hostname, '--git-protocol', 'https', '--api-protocol', 'https', '--device', '--insecure-storage']
    // glab 只把凭据当 PAT 发 PRIVATE-TOKEN；OAuth（device/web）拿到的是需要 Bearer 的
    // access token，写回配置后 glab 依旧按 PAT 发，必然 401。GitLab 侧只能走 Token 认证。
    if (task.view.channelId === 'gitlab')
      throw new TypeError('channel_gitlab_token_only')
    await command(task, args, env, true)
    task.controller.signal.throwIfAborted()
    const tokenArgs = task.view.channelId === 'github' ? ['auth', 'token', '--hostname', hostname] : ['config', 'get', 'token', '--host', hostname]
    const token = (await command(task, tokenArgs, env, false)).trim()
    if (!token || token.length > 8192 || /[\r\n]/.test(token))
      throw new Error('channel_auth_token_failed')
    task.controller.signal.throwIfAborted()
    const saved = await devops.save(task.view.channelId, { token, ...(task.view.channelId === 'gitlab' ? { host: task.origin } : {}) })
    const account = saved.accounts.find(account => account.role === 'bot')
    if (!account)
      throw new Error('channel_auth_verification_failed')
    task.view.account = { login: account.name }
    task.view.status = 'succeeded'
  }
  catch (error) {
    task.view.status = 'failed'
    const missing = error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
    task.view.error = task.controller.signal.aborted ? 'channel_auth_cancelled' : missing ? task.view.channelId === 'github' ? 'gh_missing' : 'glab_missing' : task.networkTimeout ? 'channel_auth_network_timeout' : 'channel_auth_failed'
    publish(task.view, missing ? `Required CLI is not installed: ${task.view.channelId === 'github' ? 'gh' : 'glab'}.` : task.controller.signal.aborted ? 'Authentication cancelled.' : task.networkTimeout ? `连接授权服务器超时，尚未完成登录。${env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy ? 'CLI已继承代理配置（宿主或Windows已启用配置），请检查代理连通性及绕过规则。' : 'CLI未收到HTTP(S)代理配置，当前使用直连；请检查宿主或Windows系统代理设置。'}终端可登录不代表宿主子进程使用相同网络路径。` : 'Authentication failed. Review the CLI output above.')
  }
  finally {
    clearTimeout(timeout)
    try {
      await rm(directory, { recursive: true, force: true })
    }
    catch {
      if (task.view.status !== 'succeeded')
        task.view.status = 'failed'
      task.view.error = 'channel_auth_cleanup_failed'
    }
  }
}

function command(task: Authentication, args: string[], env: NodeJS.ProcessEnv, login: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    task.controller.signal.throwIfAborted()
    const child = spawn(task.view.channelId === 'github' ? 'gh' : 'glab', args, { env, cwd: env.GH_CONFIG_DIR, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal: task.controller.signal })
    let output = ''
    const stdout = lines(task)
    const stderr = lines(task)
    let failure: Error | undefined
    let force: ReturnType<typeof setTimeout> | undefined
    const abort = () => {
      force = setTimeout(() => child.kill('SIGKILL'), 1000)
      force.unref()
    }
    task.controller.signal.addEventListener('abort', abort, { once: true })
    child.on('error', (error) => {
      failure = error
    })
    child.stdin.on('error', () => {})
    child.stdout.on('data', (chunk: Buffer) => {
      if (login) {
        stdout.write(chunk)
      }
      else {
        output = (output + chunk.toString('utf8')).slice(0, 8193)
        if (output.length > 8192) {
          failure = new Error('channel_auth_output_limit')
          task.controller.abort()
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (login)
        stderr.write(chunk)
    })
    child.once('close', (code) => {
      clearTimeout(force)
      task.controller.signal.removeEventListener('abort', abort)
      if (login) {
        stdout.end()
        stderr.end()
      }
      if (failure || code !== 0 || task.controller.signal.aborted) {
        if (login && code !== 0 && !task.controller.signal.aborted && !failure)
          publish(task.view, `CLI exited with status ${code ?? 'unknown'}.`)
        reject(failure ?? new Error('channel_auth_process_failed'))
      }
      else {
        resolve(output)
      }
    })
    child.stdin.end(login ? '\n' : undefined)
  })
}

function authorize(task: Authentication, raw: string): void {
  const view = task.view
  const text = stripVTControlCharacters(raw)
  const code = /(?:one[- ]time|device|user) code[:\s]+([A-Z0-9]{4}-[A-Z0-9]{4})\b/i.exec(text)
  if (code)
    view.userCode = code[1].toUpperCase()
  for (const match of text.matchAll(/https:\/\/[^\s'"<>]+/gi)) {
    try {
      const url = new URL(match[0])
      const allowed = view.channelId === 'github' ? ['/login/device'] : ['/oauth/device', '/-/oauth/device']
      if (url.origin === task.origin && !url.username && !url.password && !url.search && !url.hash && allowed.includes(url.pathname))
        view.verificationUri = url.href
    }
    catch {}
  }
  publish(view, text)
}

function site(channelId: string, host: string): string {
  try {
    const url = new URL(host)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && (channelId !== 'github' || url.origin === 'https://github.com'))
      return url.origin
  }
  catch {}
  throw new TypeError('invalid_channel_host')
}

function publish(view: ChannelAuthentication, line: string): void {
  view.output = [view.output, line].filter(Boolean).join('\n').slice(-1024)
}

function lines(task: Authentication) {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let discarded = false
  const complete = () => {
    const text = [...stripVTControlCharacters(pending)].filter(char => char.charCodeAt(0) >= 32 || char === '\t').join('').trim()
    if (!discarded && /(?:dial tcp|connectex|connection|connect|i\/o|TLS handshake|request|context deadline).*(?:timed? out|timeout|deadline exceeded)|(?:timed? out|timeout).*(?:connect|request)/i.test(text))
      task.networkTimeout = true
    if (!discarded && text && !/token|password|authorization|secret|gh[pousr]_|github_pat_|glpat[-_]|Bearer\s|\b[\w=-]{40,}\b/i.test(text)) {
      const safe = text.replace(/https?:\/\/[^\s'"<>]+/gi, (raw) => {
        try {
          const url = new URL(raw)
          const paths = task.view.channelId === 'github' ? ['/login/device', '/login/device/code', '/login/oauth/access_token'] : ['/oauth/device', '/-/oauth/device', '/oauth/device/code', '/oauth/token']
          if (url.origin === task.origin && !url.username && !url.password && paths.includes(url.pathname))
            return `${url.origin}${url.pathname}`
        }
        catch {}
        return '[URL omitted]'
      })
      authorize(task, safe)
    }
    pending = ''
    discarded = false
  }
  return {
    write(chunk: Buffer): void {
      const parts = decoder.write(chunk).split('\n')
      for (let index = 0; index < parts.length; index++) {
        if (!discarded) {
          if (pending.length + parts[index].length > 4096) {
            pending = ''
            discarded = true
          }
          else {
            pending += parts[index]
          }
        }
        if (index < parts.length - 1)
          complete()
      }
    },
    end(): void {
      pending += decoder.end()
      complete()
    },
  }
}
