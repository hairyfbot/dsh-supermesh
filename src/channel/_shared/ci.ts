import type { ChannelId } from '@/channel/_shared/types'
import { now } from '@/channel/_shared/primitives'
import { db } from '@/database'

/** 分支 CI 变更落成 ciWatch、ci 话题与触发；只有订阅了这条话题的票才收到通知。 */
export async function notifyBranchCi(input: { channel: ChannelId, projectId: string, ref: string, fingerprint: string, head: string, title: string, message: string, url: string, silent: boolean }): Promise<void> {
  const { row: watch } = await db.ciWatch.recordRevision({ id: `${input.channel}:${input.ref}`, channelId: input.channel, kind: 'branch', ref: input.ref, fingerprint: input.fingerprint, head: input.head, updatedAt: now() })
  if (input.silent && watch.revision === 0)
    return
  const threadId = `${input.channel}:${input.ref}`
  await db.thread.record({ id: threadId, channelId: input.channel, refId: input.ref, kind: 'ci', title: input.title, url: null, projectId: input.projectId, triage: 'claimed', triagedAt: now(), createdAt: now(), updatedAt: now() })
  const triggerId = `${watch.id}:revision:${watch.revision}`
  await db.trigger.ingest({ id: triggerId, channelId: input.channel, threadId, kind: 'ci', actorName: null, human: 0, mentioned: 0, text: input.message, url: input.url, at: now(), ref: input.head })
  // CI 不是任务来源：没人订阅这条话题时只落库，不进收件箱、不叫醒任何会话。
  for (const ticketId of await db.ticketThread.listTicketIds(threadId)) {
    const ticket = await db.ticket.findById(ticketId)
    if (!ticket || ['done', 'completed', 'cancelled'].includes(ticket.status))
      continue
    await db.inbox.enqueue({ id: `${triggerId}:ticket:${ticketId}`, type: 'project', origin: 'system', kind: 'notice', projectId: ticket.projectId, ticketId, triggerId, threadId, title: input.message, message: input.message })
  }
}
