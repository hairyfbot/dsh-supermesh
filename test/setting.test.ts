import type { SettingsPatch } from '../src/service/setting.types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStorage } from 'unstorage'
import fs from 'unstorage/drivers/fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setting } from '../src/service/setting'

const isolated = vi.hoisted(() => ({ storage: null as unknown as ReturnType<typeof import('unstorage').createStorage> }))
vi.mock('../src/storage', () => ({
  get storage() {
    return isolated.storage
  },
}))

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nexus-setting-'))
  isolated.storage = createStorage({ driver: fs({ base: directory, atomic: true }) })
})
afterEach(async () => {
  await isolated.storage.dispose()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('file-backed settings', () => {
  it('uses schema defaults without creating a file on read', async () => {
    expect(await setting.load()).toEqual({ maxWorkers: 10, backgroundLimitMinutes: 30, autoMerge: false, autoMergeMaxLines: 200, deliveryMaxAttempts: 3, deliveryRetryCeilingSeconds: 60, updatedAt: '' })
    expect(await isolated.storage.hasItem('setting')).toBe(false)
  })

  it('persists boolean settings and reloads them from a new filesystem driver', async () => {
    const saved = await setting.save({ maxWorkers: 4, autoMerge: true })
    expect(saved).toMatchObject({ maxWorkers: 4, autoMerge: true, backgroundLimitMinutes: 30 })
    expect(Number.isFinite(Date.parse(saved.updatedAt))).toBe(true)
    await isolated.storage.dispose()
    isolated.storage = createStorage({ driver: fs({ base: directory, atomic: true }) })
    expect(await setting.load()).toEqual(saved)
  })

  it('merges concurrent partial saves without losing either update', async () => {
    await Promise.all([setting.save({ maxWorkers: 3 }), setting.save({ deliveryMaxAttempts: 5 })])
    expect(await setting.load()).toMatchObject({ maxWorkers: 3, deliveryMaxAttempts: 5, autoMerge: false })
  })

  it('fills absent file fields using defaults without overwriting the file', async () => {
    await isolated.storage.setItem('setting', { maxWorkers: 2 })
    expect(await setting.load()).toMatchObject({ maxWorkers: 2, backgroundLimitMinutes: 30, autoMerge: false })
    expect(await isolated.storage.getItem('setting')).toEqual({ maxWorkers: 2 })
  })

  it.each([{}, null, [], { maxWorkers: 0 }, { maxWorkers: 17 }, { maxWorkers: 1.5 }, { maxWorkers: '3' }, { autoMerge: 1 }, { unknown: 1 }, { maxWorkers: 3, deliveryMaxAttempts: 0 }, { updatedAt: 'forged' }])('rejects invalid patches without changing the file: %j', async (patch) => {
    const original = await setting.save({ maxWorkers: 7 })
    await expect(setting.save(patch as SettingsPatch)).rejects.toThrow('invalid_config')
    expect(await setting.load()).toEqual(original)
  })

  it.each(['invalid JSON', [], { maxWorkers: 0 }, { autoMerge: 1 }, { updatedAt: 123 }, { unknown: 1 }])('rejects invalid persisted data without replacing it: %j', async (value) => {
    await isolated.storage.setItem('setting', value)
    await expect(setting.load()).rejects.toThrow('invalid_stored_settings')
    await expect(setting.save({ maxWorkers: 2 })).rejects.toThrow('invalid_stored_settings')
    expect(await isolated.storage.getItem('setting')).toEqual(value)
  })

  it('propagates storage failures and permits a later save to recover', async () => {
    const persist = vi.spyOn(isolated.storage, 'setItem').mockRejectedValueOnce(new Error('disk_full'))
    await expect(setting.save({ maxWorkers: 2 })).rejects.toThrow('disk_full')
    expect(await isolated.storage.hasItem('setting')).toBe(false)
    await setting.save({ deliveryMaxAttempts: 4 })
    expect(persist).toHaveBeenCalledTimes(2)
    expect(await setting.load()).toMatchObject({ maxWorkers: 10, deliveryMaxAttempts: 4 })
  })
})
