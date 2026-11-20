import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'

export type ChannelId = 'github' | 'gitlab' | 'feishu'

export type ThreadRow = Selectable<DB['thread']>
export type InboxRow = Selectable<DB['inbox']>
export type TicketRow = Selectable<DB['ticket']>
export type ProjectRow = Selectable<DB['project']>

export type ItemKind = 'issue' | 'pull' | 'comment' | 'review' | 'review_comment'

export type ChannelRow = Record<string, unknown>

export interface ChannelItem {
  id: string
  kind: ItemKind
  actor: string
  body: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface ResourceReaded {
  items: ChannelItem[]
  next_offset: number | null
  next_resource: string | null
}

export interface DeliveryResult {
  ok: boolean
  reason?: string
  remoteId?: string
}

export interface CollectOutcome {
  projectId: string
  ok: boolean
  reason?: string
}

export interface ChannelIdentity {
  providerId: string
  login: string
  repositoryId: string
  defaultBranch?: string | null
}

/**
 * 渠道适配器契约。两个托管平台渠道各自 implements，方法名与签名由编译器强制一致；
 * 采集能力对聊天渠道（例如飞书）不存在，因此 harvest / collect 可选。
 */
export interface ChannelAdapter {
  probe: (projectId: string, signal?: AbortSignal) => Promise<ChannelIdentity>
  read: (resource: string, offset?: number, limit?: number, signal?: AbortSignal) => Promise<ResourceReaded>
  normalize: (resource: string) => Promise<string>
  readable: (resource: string) => Promise<boolean>
  harvest?: (signal?: AbortSignal) => Promise<CollectOutcome[]>
  collect?: (projectId: string, branch?: string, signal?: AbortSignal) => Promise<CollectOutcome>
  publish: (inboxId: string, signal?: AbortSignal) => Promise<DeliveryResult>
  flush: (signal?: AbortSignal) => Promise<({ id: string } & DeliveryResult)[]>
}
