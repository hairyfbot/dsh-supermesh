import type { ChannelId, ThreadRow } from '@/channel/_shared/types'
import type { ThreadKind } from '@/database/types'
import { db } from '@/database'

export async function recordThread(input: { channel: ChannelId, refId: string, kind: ThreadKind, title: string, url: string, createdAt: string, updatedAt: string }): Promise<ThreadRow> {
  const existing = await db.thread.findByRef(input.channel, input.refId)
  return db.thread.record({ id: existing?.id ?? `${input.channel}:${input.refId}`, channelId: input.channel, refId: input.refId, kind: input.kind, title: input.title, url: input.url, createdAt: input.createdAt, updatedAt: input.updatedAt, projectId: null, triage: 'pending', triagedAt: null })
}

/** 结单话题；合并时顺带关闭同一项目下已结单票关联的 issue。 */
export async function closeThread(input: { channel: ChannelId, projectId: string, thread: ThreadRow, outcome: 'merged' | 'closed', at: string, branch: string | null, closeIssue: (url: string) => Promise<void> }): Promise<void> {
  const ended = await db.ticket.closeThread(input.thread.id, input.outcome, input.at, input.branch)
  if (input.outcome !== 'merged' || !ended.length)
    return
  for (const source of await db.thread.listByChannel(input.channel)) {
    if (source.kind !== 'issue' || source.projectId !== input.projectId || !source.url)
      continue
    if (!(await db.ticketThread.listTicketIds(source.id)).some(id => ended.includes(id)))
      continue
    await input.closeIssue(source.url).catch(() => undefined)
  }
}
