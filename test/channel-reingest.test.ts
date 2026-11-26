import type { ThreadRow } from '@/service/courier.types'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { github } from '@/channel/github/channel'
import { binding as githubBinding } from '@/channel/github/service/binding'
import { db } from '@/database'
import { courier } from '@/service/courier'

const suffix = randomUUID().slice(0, 8)
const repository = `owner/reingest-${suffix}`
const projectId = `reingest-project-${suffix}`
const ticketId = `T-reingest-${suffix}`
const threadId = `github:${repository}:7`
const url = `https://github.com/${repository}/pull/7`
const bot = `reingest-bot-${suffix}`
const at = '2026-11-26T10:00:00.000Z'
const later = '2026-11-26T10:10:00.000Z'
const ingestor = githubBinding.of(github).ingestor

let thread: ThreadRow

beforeAll(async () => {
  await db.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: at }).onConflict(oc => oc.column('id').doNothing()).execute()
  await db.insertInto('channel_account').values({ id: `github:${bot}`, channelId: 'github', role: 'bot', name: bot, avatar: null, status: 'online', createdAt: at }).onConflict(oc => oc.column('id').doNothing()).execute()
  await db.insertInto('project').values({ id: projectId, name: projectId, workspaceId: `workspace-${suffix}`, directory: `/isolated/${suffix}`, remoteUrl: `https://github.com/${repository}`, enabled: 1, orchestratorSessionId: null, createdAt: at, updatedAt: at }).execute()
  thread = await db.thread.record({ id: threadId, channelId: 'github', refId: `${repository}:7`, kind: 'pull', title: 'PR 7', url, createdAt: at, updatedAt: at, projectId, triage: 'claimed', triagedAt: at })
  await db.ticket.create({ id: ticketId, projectId, channelId: 'github', title: '修 PR', description: null, status: 'review', createdAt: at, updatedAt: at, startedAt: null, endedAt: null, prUrl: url, prState: 'open', ciState: 'passing', paused: 0, prepareError: null })
  await db.ticketThread.link(ticketId, threadId, at)
})

function comment(id: number, body: string) {
  return { id, body, user: { login: 'hairyf', type: 'User' }, html_url: `${url}#issuecomment-${id}`, created_at: at, updated_at: at }
}

async function ingest(row: ReturnType<typeof comment>, kind: 'open' | 'comment' = 'comment'): Promise<void> {
  await courier.ingest(ingestor, thread, row, kind, at, kind)
}

async function status(): Promise<string | undefined> {
  return (await db.ticket.findById(ticketId))?.status
}

/** Worker 跑完一轮并报 ready：票回到 review，采集游标下一轮还会把同一条评论再读一遍。 */
async function settleRound(): Promise<void> {
  for (const worker of await db.worker.listByTicket(ticketId)) {
    if (worker.status !== 'ended')
      await db.worker.end(worker.id, 'completed', later)
  }
  await db.ticket.setOpenStatus(ticketId, 'review', later)
}

describe('订阅话题上的消息按第一次读到算新消息', () => {
  // 采集游标回退 5 秒、靠确定性 id 去重：最新那条消息每轮都会被重读。
  // 重读若也算「人又说话了」，review 阶段的票会被无限重新派工。
  it('同一条评论被重读时不会把 review 的票重新派工', async () => {
    const row = comment(7188115418, '这里还要改一下')
    await ingest(row)
    expect(await status()).toBe('queued')
    expect(await db.worker.listByTicket(ticketId)).toMatchObject([{ status: 'queued' }])

    await settleRound()
    await ingest(row)
    expect(await status()).toBe('review')
    expect(await db.worker.listByTicket(ticketId)).toHaveLength(1)
  })

  it('新评论仍然重新派工', async () => {
    await ingest(comment(7188115419, '还有一处'))
    expect(await status()).toBe('queued')
  })

  it('pR 自己的 open 行不算新意见', async () => {
    await settleRound()
    await courier.ingest(ingestor, thread, { ...comment(6585543657, 'PR 描述'), html_url: url }, 'open', at, 'open')
    expect(await status()).toBe('review')
  })

  it('已结束的票不会被同一条旧 @ 反复唤醒', async () => {
    const row = comment(7188115420, `@${bot} 再看一下`)
    await db.ticket.finish(ticketId, 'completed', later, later)
    await ingest(row)
    expect(await status()).toBe('queued')

    await db.ticket.finish(ticketId, 'completed', later, later)
    await ingest(row)
    expect(await status()).toBe('completed')
  })
})
