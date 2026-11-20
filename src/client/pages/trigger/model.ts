import type { GetApiSupermeshDeliveryResponse, GetApiSupermeshProjectResponse, GetApiSupermeshSubscriptionResponse, GetApiSupermeshThreadResponse, GetApiSupermeshTriggerResponse } from '@/client/apis/index.type'
import type { DshSupermeshKey } from '@/client/locale'
import type { OverviewChannelKind } from '@/client/types'
import type { InboxStatus, InboxTarget, ThreadKind, ThreadTriage, TriggerKind } from '@/database/types'

export interface EventRecord {
  id: string
  channel: string
  kind: TriggerKind
  actor: string
  human: boolean
  mentioned: boolean
  text: string
  at: string
  ref?: string
  url?: string
  thread: { id: string, kind: ThreadKind, ref: string, title: string, triage: ThreadTriage, project?: string, url?: string }
  tickets: readonly string[]
  deliveries: readonly { target: InboxTarget, project?: string, status: InboxStatus, read: boolean, attempts?: number, error?: string }[]
  skipped?: 'not-mentioned' | 'ignored'
}

export type DeliveryStatus = InboxStatus | 'not-delivered'
export interface Filters {
  query: string
  channel: 'all' | OverviewChannelKind
  status: 'all' | DeliveryStatus
  kind: 'all' | TriggerKind
  mentionedOnly: boolean
}

export const KINDS = {
  comment: 'triggerKindComment',
  open: 'triggerKindOpen',
  close: 'triggerKindClose',
  ci: 'triggerKindCi',
  push: 'triggerKindPush',
} as const satisfies Record<TriggerKind, DshSupermeshKey>

export const STATUSES = {
  'pending': { label: 'triggerPending', tone: 'info' },
  'done': { label: 'triggerDone', tone: 'success' },
  'stalled': { label: 'triggerStalled', tone: 'danger' },
  'not-delivered': { label: 'triggerNotDelivered', tone: 'quiet' },
} as const

export function sourceHref(channel: string, url?: string): string | undefined {
  if (channel === 'feishu' || !url || !URL.canParse(url))
    return undefined
  const parsed = new URL(url)
  return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined
}

export function deliveryStatus(record: EventRecord): DeliveryStatus {
  if (record.deliveries.some(delivery => delivery.status === 'stalled'))
    return 'stalled'
  if (record.deliveries.some(delivery => delivery.status === 'pending'))
    return 'pending'
  return record.deliveries.length ? 'done' : 'not-delivered'
}

export function filterRecords(records: readonly EventRecord[], filters: Filters): EventRecord[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return records.filter(record =>
    (filters.channel === 'all' || record.channel === filters.channel)
    && (filters.status === 'all' || (filters.status === 'not-delivered' ? !record.deliveries.length : record.deliveries.some(delivery => delivery.status === filters.status)))
    && (filters.kind === 'all' || record.kind === filters.kind)
    && (!filters.mentionedOnly || record.mentioned)
    && (!query || [record.id, record.actor, record.channel, record.thread.ref, record.thread.project, record.ref, record.thread.title, record.text, ...record.tickets].join(' ').toLocaleLowerCase().includes(query)),
  ).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))
}

export interface Topic {
  latest: EventRecord
  events: readonly EventRecord[]
}

export function groupTopics(records: readonly EventRecord[]): Topic[] {
  const grouped = new Map<string, EventRecord[]>()
  for (const record of records) {
    const events = grouped.get(record.thread.id) ?? []
    events.push(record)
    grouped.set(record.thread.id, events)
  }
  return [...grouped.values()].map((events) => {
    events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))
    return { latest: events[0], events }
  }).sort((a, b) => Date.parse(b.latest.at) - Date.parse(a.latest.at) || b.latest.id.localeCompare(a.latest.id))
}

export function filterTopics(topics: readonly Topic[], filters: Filters): Topic[] {
  return topics.filter(topic => filterRecords(topic.events, filters).length > 0)
}

export const TRIAGE = { pending: 'triggerTriagePending', claimed: 'triggerTriageClaimed', ignored: 'triggerTriageIgnored' } as const
export const THREAD_KINDS = { issue: 'triggerTopicIssue', pull: 'triggerTopicPull', chat: 'triggerTopicChat', ci: 'triggerTopicCi' } as const

export interface RecordSource {
  project: GetApiSupermeshProjectResponse | null | undefined
  trigger: GetApiSupermeshTriggerResponse | null | undefined
  thread: GetApiSupermeshThreadResponse | null | undefined
  subscription: GetApiSupermeshSubscriptionResponse | null | undefined
  delivery: GetApiSupermeshDeliveryResponse | null | undefined
}

export function recordsOf(source: RecordSource): EventRecord[] {
  const { project, trigger, thread, subscription, delivery } = source
  if (!project || !trigger || !thread || !subscription || !delivery)
    return []
  return trigger.flatMap((item) => {
    const topic = thread.find(row => row.id === item.threadId)
    if (!topic)
      return []
    return [{
      id: item.id,
      channel: item.channelId,
      kind: item.kind,
      actor: item.actorName ?? '',
      human: Boolean(item.human),
      mentioned: Boolean(item.mentioned),
      text: item.text,
      at: item.at,
      ref: item.ref ?? undefined,
      url: item.url ?? undefined,
      thread: { id: topic.id, kind: topic.kind, ref: topic.refId, title: topic.title, triage: topic.triage, project: project.find(row => row.id === topic.projectId)?.name, url: topic.url ?? undefined },
      tickets: subscription.filter(link => link.threadId === topic.id).map(link => link.ticketId),
      deliveries: delivery.filter(message => message.triggerId === item.id).map(message => ({ target: message.type, project: project.find(row => row.id === message.projectId)?.name, status: message.status, read: Boolean(message.readAt), attempts: message.deliveryAttempts, error: message.deliveryError ?? undefined })),
    }]
  })
}
