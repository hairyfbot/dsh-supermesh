import type { Selectable } from 'kysely'
import type { DB, InboxStatus, InboxTarget, ThreadKind, ThreadTriage, TriggerKind } from '../database/types'
import { db } from '../database'

export type DeliveryStatus = InboxStatus | 'not-delivered'

export interface TopicFilters {
  query?: string
  channel?: string
  status?: 'all' | DeliveryStatus
  kind?: 'all' | TriggerKind
  mentionedOnly?: boolean
}

export interface TopicEvent {
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
  tickets: string[]
  deliveries: { target: InboxTarget, project?: string, status: InboxStatus, read: boolean, attempts?: number, error?: string }[]
}

export interface TopicRow {
  latest: TopicEvent
  events: TopicEvent[]
}

export interface TopicPage {
  data: TopicRow[]
  total: number
  page: number
  pageSize: number
}

function matchEvent(event: TopicEvent, filters: TopicFilters, thread: Selectable<DB['thread']>, projectName?: string): boolean {
  const query = (filters.query ?? '').trim().toLocaleLowerCase()
  if (filters.channel && filters.channel !== 'all' && event.channel !== filters.channel)
    return false
  if (filters.kind && filters.kind !== 'all' && event.kind !== filters.kind)
    return false
  if (filters.mentionedOnly && !event.mentioned)
    return false
  if (filters.status && filters.status !== 'all') {
    const status = event.deliveries.some(item => item.status === 'stalled')
      ? 'stalled'
      : event.deliveries.some(item => item.status === 'pending') ? 'pending' : event.deliveries.length ? 'done' : 'not-delivered'
    if (status !== filters.status)
      return false
  }
  if (query) {
    const haystack = [event.id, event.actor, event.channel, thread.refId, projectName, event.ref, thread.title, event.text, ...event.tickets].filter(Boolean).join(' ').toLocaleLowerCase()
    if (!haystack.includes(query))
      return false
  }
  return true
}

export const topic = {
  async page(filters: TopicFilters, page = 1, pageSize = 5): Promise<TopicPage> {
    const size = Math.max(1, Math.min(100, pageSize))
    const [triggers, threads, projects, subscriptions, deliveries] = await Promise.all([
      db.trigger.listRecent(1000),
      db.thread.listRecent(1000),
      db.project.listAll(),
      db.ticketThread.listAll(),
      db.inbox.listRecent(),
    ])
    const threadById = new Map(threads.map(item => [item.id, item]))
    const projectById = new Map(projects.map(item => [item.id, item]))
    const grouped = new Map<string, TopicEvent[]>()
    for (const item of triggers) {
      const thread = threadById.get(item.threadId)
      if (!thread)
        continue
      const event: TopicEvent = {
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
        thread: { id: thread.id, kind: thread.kind, ref: thread.refId, title: thread.title, triage: thread.triage, project: thread.projectId ? projectById.get(thread.projectId)?.name : undefined, url: thread.url ?? undefined },
        tickets: subscriptions.filter(link => link.threadId === thread.id).map(link => link.ticketId),
        deliveries: deliveries.filter(message => message.triggerId === item.id).map(message => ({
          target: message.type,
          project: message.projectId ? projectById.get(message.projectId)?.name : undefined,
          status: message.status,
          read: Boolean(message.readAt),
          attempts: message.deliveryAttempts,
          error: message.deliveryError ?? undefined,
        })),
      }
      if (!matchEvent(event, filters, thread, projectById.get(thread.projectId ?? '')?.name))
        continue
      const events = grouped.get(thread.id) ?? []
      events.push(event)
      grouped.set(thread.id, events)
    }
    const rows: TopicRow[] = [...grouped.values()].map((events) => {
      events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))
      return { latest: events[0], events }
    })
    rows.sort((a, b) => Date.parse(b.latest.at) - Date.parse(a.latest.at) || b.latest.id.localeCompare(a.latest.id))
    const offset = (Math.max(1, page) - 1) * size
    return { data: rows.slice(offset, offset + size), total: rows.length, page: Math.max(1, page), pageSize: size }
  },
}
