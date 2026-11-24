import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { Inbox } from '@/database/models/inbox'
import { Project } from '@/database/models/project'

let native: DatabaseSync
let connection: Kysely<DB>
let inbox: Inbox
beforeEach(async () => {
  native = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations))
    native.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  inbox = new Inbox(connection)
  const project = new Project(connection)
  await project.upsertWorkspace({ id: 'p1', workspaceId: 'w1', name: 'Repo', directory: '/repo', remoteUrl: 'https://github.com/owner/repo' }, '2025-01-01T00:00:00.000Z')
  await project.upsertWorkspace({ id: 'p2', workspaceId: 'w2', name: 'Other', directory: '/other', remoteUrl: 'https://github.com/owner/other' }, '2025-01-01T00:00:00.000Z')
})
afterEach(async () => connection.destroy())

async function askedWorker(projectId = 'p1') {
  const ask = await inbox.enqueueAsk({ type: 'project', projectId, origin: 'worker', message: '要不要改配置？' })
  return ask.id
}

describe('已答的 ask 收尾', () => {
  it('已答但投递失败的 ask 仍留在待投递列表里', async () => {
    const id = await askedWorker()
    await inbox.answer(id, '要', 'project', '2025-01-01T00:00:01.000Z')
    await inbox.markStalled(id, 'worker_ended')
    expect((await inbox.listAnswered()).map(row => row.id)).toEqual([id])
  })

  it('已答但投递失败的 ask 可以被关闭', async () => {
    const id = await askedWorker()
    await inbox.answer(id, '要', 'project', '2025-01-01T00:00:01.000Z')
    await inbox.markStalled(id, 'worker_ended')
    expect(await inbox.completeScoped([id], { type: 'project', projectId: 'p1' }, '2025-01-01T00:00:02.000Z')).toBe(1)
    expect((await inbox.findById(id))?.status).toBe('done')
  })

  it('没回答的 ask 仍然不能跳过', async () => {
    const id = await askedWorker()
    await expect(inbox.completeScoped([id], { type: 'project', projectId: 'p1' }, '2025-01-01T00:00:02.000Z')).rejects.toThrow('answer_required')
    expect((await inbox.findById(id))?.status).toBe('pending')
  })

  it('答案送不回原收件人时改投项目编排并收尾', async () => {
    const id = await askedWorker()
    await inbox.answer(id, '要', 'project', '2025-01-01T00:00:01.000Z')
    await inbox.markStalled(id, 'worker_ended')
    await inbox.relayAnswer(id, 'worker 已结束，答案没能送到它手里', '2025-01-01T00:00:02.000Z')
    const relayed = await inbox.findById(`supermesh:answer-relay:${id}`)
    expect(relayed).toMatchObject({ type: 'project', projectId: 'p1', kind: 'notice', status: 'pending' })
    expect(relayed?.message).toContain('要')
    const settled = await inbox.findById(id)
    expect(settled).toMatchObject({ status: 'done', deliveryError: 'worker_ended', nextRetryAt: null })
  })

  it('人回答的 ask 落成收件人邮箱里的一条通知', async () => {
    const ask = await inbox.enqueueAsk({ type: 'main', origin: 'project', projectId: 'p1', message: '可以合并吗？' })
    await inbox.answer(ask.id, '可以', 'user', '2025-01-01T00:00:01.000Z')
    await inbox.enqueueAnswer((await inbox.findById(ask.id))!)
    expect(await inbox.findById(`supermesh:answer:${ask.id}`)).toMatchObject({ type: 'project', origin: 'channel', kind: 'notice', message: '可以', projectId: 'p1' })
  })

  it('没有项目的答案改投主编排', async () => {
    const ask = await inbox.enqueueAsk({ type: 'main', origin: 'supervisor', message: '这条要发吗？' })
    await inbox.answer(ask.id, '发', 'user', '2025-01-01T00:00:01.000Z')
    await inbox.relayAnswer(ask.id, '答案投递失败（worker_ended）', '2025-01-01T00:00:02.000Z')
    expect(await inbox.findById(`supermesh:answer-relay:${ask.id}`)).toMatchObject({ type: 'main', projectId: null, kind: 'notice' })
  })
})

describe('投递失败的对外回复', () => {
  async function failedReply(id: string, projectId: string) {
    await inbox.enqueue({ id, type: 'user', origin: 'project', kind: 'notice', projectId, message: '已提交 PR' })
    await inbox.markStalled(id, 'unknown_repository')
  }

  it('归项目编排认领，可以放弃', async () => {
    await failedReply('reply:1', 'p1')
    expect((await inbox.listScoped({ type: 'project', projectId: 'p1' })).map(row => row.id)).toEqual(['reply:1'])
    expect(await inbox.completeScoped(['reply:1'], { type: 'project', projectId: 'p1' }, '2025-01-01T00:00:02.000Z')).toBe(1)
    expect((await inbox.findById('reply:1'))?.status).toBe('done')
  })

  it('不属于别的项目，也不归主编排', async () => {
    await failedReply('reply:1', 'p1')
    expect(await inbox.listScoped({ type: 'project', projectId: 'p2' })).toEqual([])
    expect(await inbox.listScoped({ type: 'main' })).toEqual([])
    await expect(inbox.completeScoped(['reply:1'], { type: 'project', projectId: 'p2' }, '2025-01-01T00:00:02.000Z')).rejects.toThrow('收件箱不存在或不属于当前身份')
  })

  it('还没投递出去的回复不占邮箱', async () => {
    await inbox.enqueue({ id: 'reply:1', type: 'user', origin: 'project', kind: 'notice', projectId: 'p1', message: '已提交 PR' })
    expect(await inbox.listScoped({ type: 'project', projectId: 'p1' })).toEqual([])
  })
})
