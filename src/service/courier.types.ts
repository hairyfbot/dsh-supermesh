import type { ChannelId, ChannelIdentity, ChannelRow, InboxRow, ProjectRow, ThreadRow, TicketRow } from '@/channel/_shared/types'

export type { InboxRow, ProjectRow, ThreadRow, TicketRow }

export interface Cursor {
  since: string
  signature?: string
  through?: string
  etag?: string | null
  etagSince?: string
}

export interface Receipt {
  remoteId: string
  providerId: string
  marker: string
  url: string
}

export interface FetchedPage {
  rows: ChannelRow[]
  notModified?: boolean
  etag?: string | null
}

export interface StreamInput {
  channel: ChannelId
  scope: string
  name: string
  initial: Cursor
  read: (cursor: Cursor) => Promise<{ rows: ChannelRow[], notModified: boolean, etag?: string | null }>
  advance: (cursor: Cursor, rows: ChannelRow[], startedAt: string) => Cursor
  accept: (row: ChannelRow) => Promise<void>
  signal?: AbortSignal
}

/** 一条触发该进谁的收件箱；key 参与投递去重，所以按收件人而不是按话题归属取名。 */
export interface TriggerTarget {
  key: string
  type: 'main' | 'project'
  projectId: string | null
  ticketId: string | null
}

export interface IngestPort {
  channel: ChannelId
  bots: () => Promise<{ name: string }[]>
  actor: (row: ChannelRow) => string
  human: (row: ChannelRow, bots: { name: string }[]) => boolean
  body: (row: ChannelRow) => string
  url: (row: ChannelRow, sourceKind: string, thread: ThreadRow) => string
  ref: (row: ChannelRow) => string | null
  /** 事件发生时间。issue/PR 行每次被评论都会刷新 updated_at，只有关闭事件才取它。 */
  at: (row: ChannelRow, kind: 'open' | 'comment' | 'close') => string
  createdAt: (row: ChannelRow) => string
  mentioned: (body: string, bots: { name: string }[]) => boolean
  onSubscribedTicket?: (ticket: TicketRow) => Promise<void>
}

export interface AnswerPort {
  channel: ChannelId
  admin: (row: ChannelRow) => Promise<boolean>
  parse: (body: string, thread: ThreadRow) => Promise<{ answers: Map<string, string>, conflicts: Set<string> }>
  scope: (thread: ThreadRow) => Promise<string>
}

export interface DeliveryPort<Resource> {
  channel: ChannelId
  detail: boolean
  parse: (value: string) => Promise<Resource>
  scope: (resource: Resource) => string
  projectFor: (resource: Resource) => Promise<{ id: string }>
  probe: (projectId: string, signal?: AbortSignal) => Promise<ChannelIdentity>
  comments: (resource: Resource, signal?: AbortSignal) => Promise<ChannelRow[]>
  authorId: (row: ChannelRow) => string | null
  body: (row: ChannelRow) => string
  post: (resource: Resource, body: string, signal?: AbortSignal) => Promise<ChannelRow>
  commentUrl: (row: ChannelRow, resource: Resource) => string
  askPrompt: (row: InboxRow) => string
  skipReasons: readonly string[]
}

export interface CollectContext {
  channel: ChannelId
  projectId: string
  scope: string
  baseline: string
  environment: ChannelIdentity
  attempt: (step: string, operation: () => Promise<unknown>) => Promise<void>
  fail: (error: unknown, step?: string) => void
}

export interface CollectPort {
  channel: ChannelId
  detail: boolean
  status: boolean
  scope: (project: ProjectRow) => Promise<string | null>
  project: (projectId: string) => Promise<ProjectRow>
  probe: (projectId: string, signal?: AbortSignal) => Promise<ChannelIdentity>
  collect: (context: CollectContext, signal?: AbortSignal) => Promise<void>
  collectBranch: (projectId: string, branch: string, signal?: AbortSignal) => Promise<void>
  onFailure?: (project: ProjectRow, reason: string) => void
}
