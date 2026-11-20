import type { Context } from '@deepseek-ai/cordis'
import type { ChannelConnection, ChannelKind, ChannelView } from '@/service/channel.types'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { getServerContext } from 'dsh-h3/utils'
import { db } from '@/database'
import { server } from '@/server'
import { defineService } from '@/utils/service'

const presets = [{ id: 'github', name: 'GitHub' }, { id: 'gitlab', name: 'GitLab' }, { id: 'feishu', name: '飞书' }] as const
let writing: Promise<unknown> = Promise.resolve()

export const channel = defineService({
  async list(): Promise<ChannelView[]> {
    const [rows, accounts] = await Promise.all([db.channel.listAll(), db.channelAccount.listAll()])
    return Promise.all(presets.map(async (preset): Promise<ChannelView> => {
      const row = rows.find(row => row.id === preset.id)
      const members = accounts.filter(account => account.channelId === preset.id).map(({ id, channelId, role, name, avatar, status, createdAt }) => ({ id, channelId, role, name, avatar, status, createdAt }))
      const supported = preset.id !== 'feishu'
      const hasCredential = preset.id !== 'feishu' && Boolean((await credentials().resolve(ref(preset.id as 'github' | 'gitlab')))?.value?.trim() || (await credentials().resolve(legacyRef(preset.id as 'github' | 'gitlab')))?.value?.trim())
      const enabled = supported && Boolean(row?.enabled)
      const stored = await db.sourceState.find(preset.id, 'configuration')
      const configured = hasCredential || members.length > 0 || Boolean(stored)
      const metadata = readMetadata(stored?.value)
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
  serialize<T>(action: () => Promise<T>): Promise<T> {
    const operation = writing.then(action)
    writing = operation.then(() => undefined, () => undefined)
    return operation
  },
  connection(kind: ChannelKind): Promise<ChannelConnection> {
    return channel.serialize(async () => {
      const row = await db.channel.findById(kind)
      const token = kind === 'feishu' ? undefined : await channel.resolveCredential(kind)
      return Object.freeze({ host: row?.host ?? (kind === 'gitlab' ? 'https://gitlab.com' : null), token, enabled: kind !== 'feishu' && Boolean(row?.enabled) })
    })
  },
  async resolveCredential(kind: ChannelKind): Promise<string | undefined> {
    if (kind === 'feishu')
      return undefined
    const stored = await credentials().resolve(ref(kind))
    if (stored?.value?.trim())
      return stored.value
    return (await credentials().resolve(legacyRef(kind)))?.value
  },
  async storeCredential(kind: 'github' | 'gitlab', token: string): Promise<string | undefined> {
    const previous = await credentials().resolve(ref(kind))
    await credentials().set(ref(kind), token)
    return previous?.value
  },
  async clearCredential(kind: 'github' | 'gitlab'): Promise<string | undefined> {
    const previous = await credentials().resolve(ref(kind))
    await credentials().unset(ref(kind))
    return previous?.value
  },
})

function credentials() {
  return getServerContext<Context>(server).credentials
}

function ref(kind: 'github' | 'gitlab') {
  return credentialRef(kind === 'github' ? 'SUPERMESH_GITHUB_TOKEN' : 'SUPERMESH_GITLAB_TOKEN')
}

function legacyRef(kind: 'github' | 'gitlab') {
  return credentialRef(kind === 'github' ? 'NEXUS_GITHUB_TOKEN' : 'NEXUS_GITLAB_TOKEN')
}

function readMetadata(raw: string | undefined): { commitName: string, commitEmail: string } {
  if (!raw)
    return { commitName: '', commitEmail: '' }
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('commitName' in value) || !('commitEmail' in value) || typeof value.commitName !== 'string' || typeof value.commitEmail !== 'string')
    throw new Error('invalid_channel_metadata')
  return { commitName: value.commitName, commitEmail: value.commitEmail }
}
