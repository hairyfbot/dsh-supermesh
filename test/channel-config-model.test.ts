import type { DB } from '../src/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../src/database/migrations'
import { Channel } from '../src/database/models/channel'
import { ChannelAccount } from '../src/database/models/channel-account'
import { SourceState } from '../src/database/models/source-state'

let native: DatabaseSync
let connection: Kysely<DB>
let model: Channel
beforeEach(() => {
  native = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations))
    native.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  model = new Channel(connection)
})
afterEach(async () => connection.destroy())

describe('渠道配置模型', () => {
  it('重复保存只保留一个全局bot且保留admin及其它渠道配置', async () => {
    await model.saveConfiguration('github', 'GitHub', null, true, { commitName: 'Bot', commitEmail: 'bot@example.com' }, { name: 'first', avatar: null })
    const createdAt = (await model.findById('github'))!.createdAt
    await connection.insertInto('channel_account').values({ id: 'admin', channelId: 'github', role: 'admin', name: 'Owner', avatar: null, createdAt: 'admin-time' }).execute()
    await model.saveConfiguration('gitlab', 'GitLab', 'https://gitlab.example.com', false, { commitName: 'Lab', commitEmail: '' })
    await model.saveConfiguration('github', 'GitHub', null, false, { commitName: 'Changed', commitEmail: '' }, { name: 'second', avatar: null })
    expect(await model.findById('github')).toMatchObject({ enabled: 0, createdAt })
    const accounts = await new ChannelAccount(connection).findByChannel('github')
    expect(accounts.map(account => [account.role, account.name])).toEqual([['admin', 'Owner'], ['bot', 'second']])
    const metadata = await new SourceState(connection).find('github', 'configuration')
    expect(JSON.parse(metadata!.value)).toEqual({ commitName: 'Changed', commitEmail: '' })
    expect(await model.findById('gitlab')).toMatchObject({ host: 'https://gitlab.example.com', enabled: 0 })
  })

  it('账户写入失败时回滚渠道开关、metadata及原bot', async () => {
    await model.saveConfiguration('github', 'GitHub', null, false, { commitName: 'Before', commitEmail: '' }, { name: 'before', avatar: null })
    native.exec('CREATE TRIGGER reject_account BEFORE INSERT ON channel_account BEGIN SELECT RAISE(ABORT, \'test_failure\'); END')
    await expect(model.saveConfiguration('github', 'GitHub', null, true, { commitName: 'After', commitEmail: '' }, { name: 'after', avatar: null })).rejects.toThrow('test_failure')
    expect(await model.findById('github')).toMatchObject({ enabled: 0 })
    expect(await new ChannelAccount(connection).findByChannel('github')).toMatchObject([{ name: 'before' }])
    expect(JSON.parse((await new SourceState(connection).find('github', 'configuration'))!.value)).toEqual({ commitName: 'Before', commitEmail: '' })
  })
})
