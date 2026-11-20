import type { ChannelId } from '@/channel/_shared/types'
import { now } from '@/channel/_shared/primitives'
import { db } from '@/database'

/** 分支 CI 变更落成 ciWatch、ci 话题、触发与项目通知。silent 为真时首轮不打扰。 */
export async function notifyBranchCi(input: { channel: ChannelId, projectId: string, ref: string, fingerprint: string, head: string, title: string, message: string, url: string, silent: boolean }): Promise<void> {
  const { row: watch } = await db.ciWatch.recordRevision({ id: `${input.channel}:${input.ref}`, channelId: input.channel, kind: 'branch', ref: input.ref, fingerprint: input.fingerprint, head: input.head, updatedAt: now() })
  if (input.silent && watch.revision === 0)
    return
  const threadId = `${input.channel}:${input.ref}`
  await db.thread.record({ id: threadId, channelId: input.channel, refId: input.ref, kind: 'ci', title: input.title, url: null, projectId: input.projectId, triage: 'claimed', triagedAt: now(), createdAt: now(), updatedAt: now() })
  const triggerId = `${watch.id}:revision:${watch.revision}`
  await db.trigger.ingest({ id: triggerId, channelId: input.channel, threadId, kind: 'ci', actorName: null, human: 0, mentioned: 0, text: input.message, url: input.url, at: now(), ref: input.head })
  await db.inbox.enqueue({ id: `${triggerId}:project:${input.projectId}`, type: 'project', origin: 'system', kind: 'notice', projectId: input.projectId, triggerId, threadId, title: input.message, message: input.message })
}
