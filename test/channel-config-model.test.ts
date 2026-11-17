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

  it('启用提交确立观察起点且普通保存不刷新', async () => {
    const states = new SourceState(connection)
    const before = new Date().toISOString()
    await model.saveConfiguration('github', 'GitHub', null, true, { commitName: '', commitEmail: '' })
    const activation = (await states.find('github', 'activation'))!
    expect(JSON.parse(activation.value) >= before).toBe(true)
    expect(JSON.parse(activation.value) <= new Date().toISOString()).toBe(true)
    await model.saveConfiguration('github', 'GitHub', null, true, { commitName: 'Changed', commitEmail: '' })
    expect(await states.find('github', 'activation')).toEqual(activation)
  })

  it('gitLab换站保存保留旧管理员历史，但不新增或改写名单', async () => {
    const accounts = new ChannelAccount(connection)
    await model.saveConfiguration('gitlab', 'GitLab', 'https://old.example.com', true, { commitName: '', commitEmail: '' }, { name: 'bot', avatar: null })
    await connection.insertInto('channel_account').values({ id: 'legacy-admin', channelId: 'gitlab', role: 'admin', name: 'old-owner', avatar: null, createdAt: 'admin-time' }).execute()
    await model.saveConfiguration('gitlab', 'GitLab', 'https://new.example.com', true, { commitName: '', commitEmail: '' }, { name: 'bot', avatar: null }, true)
    expect((await accounts.findByRole('gitlab', 'admin')).map(row => [row.id, row.name, row.createdAt])).toEqual([['legacy-admin', 'old-owner', 'admin-time']])
  })

  it('重新启用可更新渠道观察起点但不重置已采集仓库baseline或cursor', async () => {
    const states = new SourceState(connection)
    await model.saveConfiguration('github', 'GitHub', null, false, { commitName: '', commitEmail: '' })
    await states.set('github', 'activation', JSON.stringify('2025-01-01T00:00:00.000Z'), '2025-01-01T00:00:00.000Z')
    await states.set('github', 'owner/repo:baseline', JSON.stringify('2025-02-01T00:00:00.000Z'), 'baseline-time')
    await states.set('github', 'owner/repo:cursor:comments', JSON.stringify({ since: '2025-03-01T00:00:00.000Z' }), 'cursor-time')
    const before = new Date().toISOString()
    await model.saveConfiguration('github', 'GitHub', null, true, { commitName: '', commitEmail: '' })
    expect(JSON.parse((await states.find('github', 'activation'))!.value) >= before).toBe(true)
    expect(await states.find('github', 'owner/repo:baseline')).toMatchObject({ value: JSON.stringify('2025-02-01T00:00:00.000Z'), updatedAt: 'baseline-time' })
    expect(await states.find('github', 'owner/repo:cursor:comments')).toMatchObject({ value: JSON.stringify({ since: '2025-03-01T00:00:00.000Z' }), updatedAt: 'cursor-time' })
  })

  it('已启用的旧渠道补存观察起点使用createdAt而非配置保存时刻', async () => {
    await connection.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: '2025-01-01T00:00:00.000Z' }).execute()
    await model.saveConfiguration('github', 'GitHub', null, true, { commitName: '', commitEmail: '' })
    expect(JSON.parse((await new SourceState(connection).find('github', 'activation'))!.value)).toBe('2025-01-01T00:00:00.000Z')
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
