import type { Context } from '@deepseek-ai/cordis'
import type { ChannelConfiguration, ChannelConnection, ChannelKind, ChannelView } from './channel.types'
import process from 'node:process'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createRouteDispatcher } from '@deepseek-ai/dsh-http-proxy'
import { getServerContext } from 'dsh-h3/utils'
import { fetch } from 'undici'
import { channelProxyEnvironment } from '../channel/proxy'
import { db } from '../database'
import { server } from '../server'
import { defineService } from '../utils/service'

const presets = [{ id: 'github', name: 'GitHub' }, { id: 'gitlab', name: 'GitLab' }, { id: 'feishu', name: '飞书' }] as const
let writing: Promise<unknown> = Promise.resolve()

export const channel = defineService({
  async list(): Promise<ChannelView[]> {
    const [rows, accounts] = await Promise.all([db.channel.listAll(), db.channelAccount.listAll()])
    return Promise.all(presets.map(async (preset): Promise<ChannelView> => {
      const row = rows.find(row => row.id === preset.id)
      const members = accounts.filter(account => account.channelId === preset.id).map(({ id, channelId, role, name, avatar, status, createdAt }) => ({ id, channelId, role, name, avatar, status, createdAt }))
      const supported = preset.id !== 'feishu'
      const hasCredential = preset.id !== 'feishu' && (await credentials().describe(ref(preset.id))).configured
      const enabled = supported && Boolean(row?.enabled)
      const stored = await db.sourceState.find(preset.id, 'configuration')
      const configured = hasCredential || members.length > 0 || Boolean(stored)
      const metadata = readMetadata(stored?.value, preset.id)
      return {
        id: preset.id,
        kind: preset.id,
        name: row?.name ?? preset.name,
        host: row?.host ?? (preset.id === 'gitlab' ? 'https://gitlab.com' : null),
        enabled,
        createdAt: row?.createdAt ?? '',
        accounts: members,
        configured,
        supported,
        hasCredential,
        status: !supported ? 'unsupported' : !configured ? 'unconfigured' : !enabled ? 'disabled' : members.some(account => account.role === 'bot' && account.status === 'online') ? 'online' : 'offline',
        ...metadata,
      }
    }))
  },
  connection(kind: ChannelKind): Promise<ChannelConnection> {
    const operation = writing.then(async () => {
      const row = await db.channel.findById(kind)
      const token = kind === 'feishu' ? undefined : (await credentials().resolve(ref(kind)))?.value
      return Object.freeze({ host: row?.host ?? (kind === 'gitlab' ? 'https://gitlab.com' : null), token, enabled: kind !== 'feishu' && Boolean(row?.enabled) })
    })
    writing = operation.then(() => undefined, () => undefined)
    return operation
  },
  async resolveCredential(kind: ChannelKind): Promise<string | undefined> {
    if (kind === 'feishu')
      return undefined
    return (await credentials().resolve(ref(kind)))?.value
  },
  removeCredentials(kind: string): Promise<ChannelView> {
    const operation = writing.then(() => removeCredentials(kind))
    writing = operation.catch(() => undefined)
    return operation.then(async (view) => {
      const { shell } = await import('./shell')
      await shell.refresh()
      return view
    })
  },
  save(kind: string, patch: ChannelConfiguration): Promise<ChannelView> {
    const operation = writing.then(() => save(kind, patch))
    writing = operation.catch(() => undefined)
    return operation.then(async (view) => {
      const { shell } = await import('./shell')
      await shell.refresh()
      return view
    })
  },
})

function credentials() {
  return getServerContext<Context>(server).credentials
}

function ref(kind: 'github' | 'gitlab') {
  return credentialRef(kind === 'github' ? 'NEXUS_GITHUB_TOKEN' : 'NEXUS_GITLAB_TOKEN')
}

function readMetadata(raw: string | undefined, kind: ChannelKind): { commitName: string, commitEmail: string, expectedAccount?: string } {
  if (!raw)
    return { commitName: '', commitEmail: '' }
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('commitName' in value) || !('commitEmail' in value) || typeof value.commitName !== 'string' || typeof value.commitEmail !== 'string')
    throw new Error('invalid_channel_metadata')
  if (kind === 'gitlab' && 'expectedAccount' in value && typeof value.expectedAccount !== 'string')
    throw new Error('invalid_channel_metadata')
  return { commitName: value.commitName, commitEmail: value.commitEmail, ...(kind === 'gitlab' && 'expectedAccount' in value && value.expectedAccount ? { expectedAccount: value.expectedAccount as string } : {}) }
}

async function removeCredentials(kind: string): Promise<ChannelView> {
  if (kind !== 'github' && kind !== 'gitlab')
    throw new TypeError('channel_unsupported')
  const previous = await credentials().resolve(ref(kind))
  await credentials().unset(ref(kind))
  try {
    await db.channel.removeCredentials(kind)
  }
  catch {
    if (previous)
      await credentials().set(ref(kind), previous.value)
    throw new Error('channel_credentials_delete_failed')
  }
  return (await channel.list()).find(item => item.kind === kind)!
}

async function save(kind: string, patch: ChannelConfiguration): Promise<ChannelView> {
  if (kind !== 'github' && kind !== 'gitlab')
    throw new TypeError('channel_unsupported')
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['host', 'enabled', 'expectedAccount', 'commitName', 'commitEmail', 'token'].includes(key)) || (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') || ['host', 'commitName', 'commitEmail', 'token'].some(key => patch[key as keyof ChannelConfiguration] !== undefined && typeof patch[key as keyof ChannelConfiguration] !== 'string'))
    throw new TypeError('invalid_channel_config')
  if (patch.token !== undefined && (!patch.token.trim() || patch.token.length > 8192 || /[\r\n]/.test(patch.token)))
    throw new TypeError('invalid_channel_token')
  if ((patch.commitName?.length ?? 0) > 200 || (patch.commitEmail?.length ?? 0) > 254 || /[\r\n]/.test((patch.commitName ?? '') + (patch.commitEmail ?? '')) || (patch.commitEmail && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(patch.commitEmail.trim())))
    throw new TypeError('invalid_commit_identity')
  if (kind === 'gitlab' && patch.expectedAccount !== undefined && (typeof patch.expectedAccount !== 'string' || patch.expectedAccount.length > 100 || (patch.expectedAccount.trim() && !/^[a-z0-9][\w.-]*$/i.test(patch.expectedAccount.trim()))))
    throw new TypeError('invalid_expected_account')
  const current = (await channel.list()).find(item => item.kind === kind)!
  const expectedAccount = kind === 'gitlab' ? patch.expectedAccount?.trim() ?? current.expectedAccount : undefined
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
  let account: { name: string, avatar: string | null } | undefined
  if (hostChanged && (current.hasCredential || current.accounts.length > 0) && !token)
    throw new TypeError('channel_account_required')
  if (token) {
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
      if (expectedAccount && (typeof user.username !== 'string' || user.username.toLowerCase() !== expectedAccount.toLowerCase()))
        throw new TypeError('channel_identity_mismatch')
      account = { name: login.trim(), avatar: null }
    }
    finally {
      await dispatcher.close()
    }
  }
  if (kind === 'gitlab' && !token && expectedAccount && current.accounts.some(account => account.role === 'bot' && account.name.toLowerCase() !== expectedAccount.toLowerCase()))
    throw new TypeError('channel_identity_mismatch')
  const enabled = patch.enabled ?? (Boolean(account) || current.enabled)
  if (enabled && !account && !current.accounts.some(account => account.role === 'bot' && account.status === 'online'))
    throw new TypeError('channel_account_required')
  const previous = token ? await credentials().resolve(ref(kind)) : undefined
  if (token)
    await credentials().set(ref(kind), token)
  try {
    await db.channel.saveConfiguration(kind, current.name, kind === 'gitlab' ? url.origin : null, enabled, { commitName: patch.commitName?.trim() ?? current.commitName, commitEmail: patch.commitEmail?.trim() ?? current.commitEmail, ...(expectedAccount ? { expectedAccount } : {}) }, account, ...(hostChanged ? [true] as const : []))
  }
  catch {
    if (token) {
      if (previous)
        await credentials().set(ref(kind), previous.value)
      else
        await credentials().unset(ref(kind))
    }
    throw new Error('channel_save_failed')
  }
  return (await channel.list()).find(item => item.kind === kind)!
}
