import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { Project } from '@/database/models/project'

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
