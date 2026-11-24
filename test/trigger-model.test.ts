import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { Trigger } from '@/database/models/trigger'

let native: DatabaseSync
let connection: Kysely<DB>
let trigger: Trigger

const threadId = 'github:owner/repo:1'
const id = `${threadId}:comment:7132684241`
const at = '2026-01-01T00:00:00.000Z'

beforeEach(async () => {
  native = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations))
    native.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  trigger = new Trigger(connection)
  await connection.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: at }).execute()
  await connection.insertInto('thread').values({ id: threadId, channelId: 'github', projectId: null, refId: 'owner/repo:1', kind: 'issue', title: 'Issue', url: 'https://github.com/owner/repo/issues/1', createdAt: at, updatedAt: at, triage: 'pending', triagedAt: null }).execute()
})
afterEach(async () => connection.destroy())

function comment(overrides: Partial<Parameters<Trigger['ingest']>[0]> = {}) {
  return {
    id,
    channelId: 'github',
    threadId,
    kind: 'comment' as const,
    actorName: 'hairyf',
    human: 1,
    mentioned: 0,
    text: '我觉得这应该跟 #56 有关联，请关联相关 issues 一起修了',
    url: 'https://github.com/owner/repo/issues/1#issuecomment-7132684241',
    at,
    ref: null,
    ...overrides,
  }
}

describe('触发记录跟随消息编辑', () => {
  it('同一条评论被补上 @bot 后，重读会把点名和正文一起更新', async () => {
    await trigger.ingest(comment())
    const edited = await trigger.ingest(comment({ mentioned: 1, text: '我觉得这应该跟 #56 有关联，请关联相关 issues 一起修了\n\n@hairyfbot ', at: '2026-01-01T00:11:00.000Z' }))
    expect(edited).toMatchObject({ id, mentioned: 1, at: '2026-01-01T00:11:00.000Z' })
    expect(edited.text.endsWith('@hairyfbot ')).toBe(true)
    expect(await trigger.listByThread(threadId)).toHaveLength(1)
  })

  it('正文、作者、链接、引用都按最新一次采集覆盖', async () => {
    await trigger.ingest(comment())
    const edited = await trigger.ingest(comment({ text: '改过的正文', url: 'https://github.com/owner/repo/issues/1#issuecomment-7132684241', ref: 'dsh/T-1' }))
    expect(edited).toMatchObject({ text: '改过的正文', ref: 'dsh/T-1' })
  })

  it('内容没变的重读不产生第二行，也不改原有事实', async () => {
    const first = await trigger.ingest(comment())
    const again = await trigger.ingest(comment())
    expect(again).toEqual(first)
    expect(await trigger.listByThread(threadId)).toHaveLength(1)
  })
})
