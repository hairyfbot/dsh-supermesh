import type { ChannelId, ThreadRow } from '@/channel/_shared/types'
import type { ThreadKind } from '@/database/types'
import { db } from '@/database'
import { worker } from '@/service/worker'

/**
 * 记录话题。采集侧已经知道仓库属于哪个项目时一并写入归属，触发邮件就不必让主编排拿仓库名去猜；
 * 分诊结论仍然是 pending，投递路由不变。
 */
export async function recordThread(input: { channel: ChannelId, refId: string, kind: ThreadKind, title: string, url: string, createdAt: string, updatedAt: string, projectId?: string | null }): Promise<ThreadRow> {
  const existing = await db.thread.findByRef(input.channel, input.refId)
  const row = await db.thread.record({ id: existing?.id ?? `${input.channel}:${input.refId}`, channelId: input.channel, refId: input.refId, kind: input.kind, title: input.title, url: input.url, createdAt: input.createdAt, updatedAt: input.updatedAt, projectId: input.projectId ?? null, triage: 'pending', triagedAt: null })
  if (row.projectId || !input.projectId)
    return row
  await db.thread.bindProject(row.id, input.projectId)
  return (await db.thread.findById(row.id))!
}

/** 同一仓库下已经记录、但还没有归属的话题补上项目；只写 projectId，不动分诊结论。 */
export async function bindThreads(input: { channel: ChannelId, refPrefix: string, projectId: string }): Promise<void> {
  for (const thread of await db.thread.listUnbound(input.channel)) {
    if (!thread.refId.startsWith(input.refPrefix))
      continue
    await db.thread.bindProject(thread.id, input.projectId)
  }
}

/** 结单话题；合并时顺带关闭同一项目下已结单票关联的 issue。 */
export async function closeThread(input: { channel: ChannelId, projectId: string, thread: ThreadRow, outcome: 'merged' | 'closed', at: string, closeIssue: (url: string) => Promise<void> }): Promise<void> {
  const ended = await db.ticket.closeThread(input.thread.id, input.outcome, input.at)
  for (const ticketId of ended)
    await worker.archiveSessions(ticketId)
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
