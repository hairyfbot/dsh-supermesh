import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { SourceState } from '@/database/models/source-state'

let native: DatabaseSync
let connection: Kysely<DB>
let model: SourceState
beforeEach(async () => {
  native = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations))
    native.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  model = new SourceState(connection)
  await connection.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: '2025-01-01T00:00:00.000Z' }).execute()
})
afterEach(async () => connection.destroy())

describe('渠道游标作用域改名', () => {
  it('把旧仓库的游标整体搬到新仓库，其它作用域不受影响', async () => {
    await model.set('github', 'owner/old:baseline', JSON.stringify('2025-01-01T00:00:00.000Z'), 'baseline-time')
    await model.set('github', 'owner/old:cursor:comments', JSON.stringify({ since: '2025-02-01T00:00:00.000Z' }), 'cursor-time')
    await model.set('github', 'owner/old-suffix:baseline', JSON.stringify('2025-03-01T00:00:00.000Z'), 'sibling-time')
    await model.renameScope('github', 'owner/old', 'owner/new', '2025-04-01T00:00:00.000Z')
    expect(await model.find('github', 'owner/old:baseline')).toBeUndefined()
    expect(await model.find('github', 'owner/old:cursor:comments')).toBeUndefined()
    expect(await model.find('github', 'owner/new:baseline')).toMatchObject({ value: JSON.stringify('2025-01-01T00:00:00.000Z'), updatedAt: '2025-04-01T00:00:00.000Z' })
    expect(await model.find('github', 'owner/new:cursor:comments')).toMatchObject({ value: JSON.stringify({ since: '2025-02-01T00:00:00.000Z' }) })
    expect(await model.find('github', 'owner/old-suffix:baseline')).toMatchObject({ value: JSON.stringify('2025-03-01T00:00:00.000Z') })
  })

  it('新作用域已有同名游标时保留新值，不覆盖也不删旧行', async () => {
    await model.set('github', 'owner/old:baseline', JSON.stringify('2025-01-01T00:00:00.000Z'), 'old-time')
    await model.set('github', 'owner/new:baseline', JSON.stringify('2025-05-01T00:00:00.000Z'), 'new-time')
    await model.renameScope('github', 'owner/old', 'owner/new', '2025-06-01T00:00:00.000Z')
    expect(await model.find('github', 'owner/new:baseline')).toMatchObject({ value: JSON.stringify('2025-05-01T00:00:00.000Z'), updatedAt: 'new-time' })
    expect(await model.find('github', 'owner/old:baseline')).toMatchObject({ value: JSON.stringify('2025-01-01T00:00:00.000Z') })
  })
})
