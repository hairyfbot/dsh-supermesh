import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { register } from 'tsx/esm/api'

register()
const { setting } = await import('../../src/service/setting.ts')
const { storage } = await import('../../src/storage/index.ts')
const { acceptsChannelTrigger } = await import('../../src/channel/admission.ts')

assert.equal(process.env.DSH_HOME, join(process.cwd(), 'home'))
try {
  assert.deepEqual((await setting.load()).administrators, [])
  await storage.setItem('setting', { maxWorkers: 4 })
  assert.deepEqual((await setting.load()).administrators, [])
  assert.equal((await setting.load()).maxWorkers, 4)
  const source = [' Owner ', 'owner', 'Team.Owner', 'other_user']
  const saving = setting.save({ administrators: source })
  source[0] = 'changed-after-save'
  const saved = await saving
  assert.deepEqual(saved.administrators, ['Owner', 'Team.Owner', 'other_user'])
  assert.equal(saved.maxWorkers, 4)
  assert.equal(typeof saved.updatedAt, 'string')
  const file = JSON.parse(await readFile(join(process.env.DSH_HOME, '.nexus', 'storage.json', 'setting'), 'utf8'))
  assert.deepEqual(file.administrators, ['Owner', 'Team.Owner', 'other_user'])
  await Promise.all([setting.save({ maxWorkers: 5 }), setting.save({ administrators: ['Shared.Owner'] })])
  assert.equal((await setting.load()).maxWorkers, 5)
  assert.deepEqual((await setting.load()).administrators, ['Shared.Owner'])
  const base = { human: true, historical: false, subscribed: false, mentioned: true, kind: 'comment', ignored: false }
  for (const actorName of ['shared.owner', 'SHARED.OWNER']) {
    const admin = (await setting.load()).administrators.some(name => name.toLowerCase() === actorName.toLowerCase())
    assert.equal(acceptsChannelTrigger({ ...base, admin }), true)
  }
  await setting.save({ administrators: [] })
  assert.deepEqual((await setting.load()).administrators, [])
  const admin = (await setting.load()).administrators.some(name => name.toLowerCase() === 'legacy-owner')
  assert.equal(acceptsChannelTrigger({ ...base, admin }), false)
  assert.equal(acceptsChannelTrigger({ ...base, admin, subscribed: true }), true)
  assert.equal(acceptsChannelTrigger({ ...base, admin: true, human: false }), false)
  for (const administrators of [['@owner'], ['Display Name'], ['https://github.com/owner'], [''], [null], 'owner', Array.from({ length: 101 }).fill('owner')]) {
    await assert.rejects(setting.save({ administrators }), { message: 'invalid_config' })
    assert.deepEqual((await setting.load()).administrators, [])
  }
  for (const autoMergeMaxLines of [0, 10001, 1.5, '200']) {
    await assert.rejects(setting.save({ autoMergeMaxLines }), { message: 'invalid_config' })
  }
  assert.equal((await setting.load()).autoArchiveWorkers, false)
  assert.equal((await setting.save({ autoArchiveWorkers: true })).autoArchiveWorkers, true)
  assert.equal((await setting.save({ autoArchiveWorkers: false })).autoArchiveWorkers, false)
  assert.equal((await setting.save({ autoMerge: true })).autoMerge, true)
  assert.equal((await setting.load()).autoMerge, true)
  await storage.setItem('setting', { autoMerge: 'yes' })
  await assert.rejects(setting.load(), { message: 'invalid_stored_settings' })
  await storage.setItem('setting', { administrators: ['@invalid'] })
  await assert.rejects(setting.load(), { message: 'invalid_stored_settings' })
  process.stdout.write('SETTING_STORAGE_PASS\n')
}
finally {
  await storage.dispose()
}
