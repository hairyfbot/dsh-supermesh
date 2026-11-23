import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { Project } from '@/database/models/project'
import { SourceState } from '@/database/models/source-state'

let native: DatabaseSync
let connection: Kysely<DB>
let model: Project
beforeEach(() => {
  native = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations))
    native.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  model = new Project(connection)
})
afterEach(async () => connection.destroy())

describe('项目远端地址', () => {
  it('改名后写回新远端并保留其余字段', async () => {
    await model.upsertWorkspace({ id: 'p1', workspaceId: 'w1', name: 'Repo', directory: '/repo', remoteUrl: 'https://github.com/owner/old' }, '2025-01-01T00:00:00.000Z')
    await model.setRemoteUrl('p1', 'https://github.com/owner/new', '2025-02-01T00:00:00.000Z')
    expect(await model.findById('p1')).toMatchObject({ remoteUrl: 'https://github.com/owner/new', name: 'Repo', directory: '/repo', enabled: 1, updatedAt: '2025-02-01T00:00:00.000Z' })
  })
})

describe('采集状态按项目归属', () => {
  it('按后缀取到每个项目最近一次采集结果，不混入游标', async () => {
    const states = new SourceState(connection)
    await connection.insertInto('channel').values({ id: 'gitlab', name: 'GitLab', enabled: 1, host: 'http://10.0.0.5', createdAt: '2025-01-01T00:00:00.000Z' }).execute()
    await states.set('gitlab', 'p1:collection_status', JSON.stringify({ ok: false, reasons: ['repository_mismatch'], collectedAt: '2025-01-02T00:00:00.000Z' }), '2025-01-02T00:00:00.000Z')
    await states.set('gitlab', 'group/project:baseline', JSON.stringify('2025-01-01T00:00:00.000Z'), '2025-01-01T00:00:00.000Z')
    await states.set('gitlab', 'group/project:collection_status', JSON.stringify({ ok: true, reasons: [], collectedAt: '2025-01-03T00:00:00.000Z' }), '2025-01-03T00:00:00.000Z')
    const rows = await states.listBySuffix('collection_status')
    expect(rows.map(row => row.name).sort()).toEqual(['group/project:collection_status', 'p1:collection_status'])
    expect(JSON.parse(rows.find(row => row.name === 'p1:collection_status')!.value)).toMatchObject({ ok: false, reasons: ['repository_mismatch'] })
  })
})
