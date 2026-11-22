import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { Thread } from '@/database/models/thread'
import { Ticket } from '@/database/models/ticket'

let native: DatabaseSync
let connection: Kysely<DB>
let ticket: Ticket
let thread: Thread

beforeEach(async () => {
  native = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations))
    native.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  ticket = new Ticket(connection)
  thread = new Thread(connection)
  await connection.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: '2026-01-01T00:00:00.000Z' }).execute()
  for (const id of ['p1', 'p2']) {
    await connection.insertInto('project').values({ id, name: id, workspaceId: `w-${id}`, directory: `/repo/${id}`, remoteUrl: 'https://github.com/owner/repo', enabled: 1, orchestratorSessionId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }).execute()
  }
  await connection.insertInto('ticket').values([
    { id: 'T-001', projectId: 'p1', channelId: 'github', title: 'a', description: null, status: 'waiting', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', startedAt: null, endedAt: null, prUrl: 'https://github.com/owner/repo/pull/7', prState: null, ciState: null, paused: 0, prepareError: null },
    { id: 'T-002', projectId: 'p1', channelId: 'github', title: 'b', description: null, status: 'waiting', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', startedAt: null, endedAt: null, prUrl: null, prState: null, ciState: null, paused: 0, prepareError: null },
    { id: 'T-003', projectId: 'p2', channelId: 'github', title: 'c', description: null, status: 'waiting', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', startedAt: null, endedAt: null, prUrl: 'https://github.com/owner/repo/pull/7', prState: null, ciState: null, paused: 0, prepareError: null },
  ]).execute()
})
afterEach(async () => connection.destroy())

describe('按变更请求反查票', () => {
  it('只返回同一项目里挂着这个 PR 的票', async () => {
    const rows = await ticket.listByPullRequest('p1', 'https://github.com/owner/repo/pull/7')
    expect(rows.map(row => row.id)).toEqual(['T-001'])
  })

  it('没有挂上这个 PR 时返回空', async () => {
    expect(await ticket.listByPullRequest('p1', 'https://github.com/owner/repo/pull/8')).toEqual([])
  })
})

describe('话题标题', () => {
  it('只替换标题，不动轮询判据用的 updatedAt', async () => {
    await thread.record({ id: 'github:owner/repo:7', channelId: 'github', refId: 'owner/repo:7', kind: 'pull', title: 'PR #7', url: 'https://github.com/owner/repo/pull/7', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', projectId: 'p1', triage: 'claimed', triagedAt: '2026-01-01T00:00:00.000Z' })
    await thread.setTitle('github:owner/repo:7', '修好日期显示')
    expect(await thread.findById('github:owner/repo:7')).toMatchObject({ title: '修好日期显示', updatedAt: '2026-01-02T00:00:00.000Z' })
  })
})
