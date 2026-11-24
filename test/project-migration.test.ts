import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { MigrationProvider } from '@/database/utils/migration'

const databases: DatabaseSync[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('project schema migration', () => {
  it.each([true, false])('keeps projects and linked tickets and restores foreign keys=%s', async (foreignKeys) => {
    const database = new DatabaseSync(':memory:')
    databases.push(database)
    database.exec(foreignKeys ? 'PRAGMA foreign_keys=ON' : 'PRAGMA foreign_keys=OFF')
    database.exec(migrations['20261113135519'])
    database.exec(`
      INSERT INTO channel (id, name, createdAt) VALUES ('github', 'GitHub', '2026-11-17');
      INSERT INTO project (id, channelId, name, workspaceId, directory, createdAt, updatedAt)
        VALUES ('p', 'github', 'owner/repo', 'w', '/workspace', '2026-11-17', '2026-11-17');
      INSERT INTO ticket (id, projectId, channelId, title, status, createdAt, updatedAt)
        VALUES ('T-1', 'p', 'github', 'Existing task', 'queued', '2026-11-17', '2026-11-17');
      INSERT INTO worker (id, ticketId, status, createdAt) VALUES ('worker', 'T-1', 'queued', '2026-11-17');
      INSERT INTO inbox (id, seq, type, projectId, origin, kind, message, ticketId, workerId, createdAt)
        VALUES ('ask', 1, 'project', 'p', 'worker', 'ask', 'Keep this question', 'T-1', 'worker', '2026-11-17');
    `)
    const provider = new MigrationProvider(database, { project: migrations['20261117170000_project_workspace'] })
    const changes = await provider.getMigrations()
    await changes.project.up(undefined as never)
    expect(database.prepare('SELECT id, name, remoteUrl, enabled FROM project').all()).toEqual([{ id: 'p', name: 'owner/repo', remoteUrl: null, enabled: 1 }])
    expect(database.prepare('SELECT id FROM ticket').all()).toEqual([{ id: 'T-1' }])
    expect(database.prepare('SELECT id FROM worker').all()).toEqual([{ id: 'worker' }])
    expect(database.prepare('SELECT id FROM inbox').all()).toEqual([{ id: 'ask' }])
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: Number(foreignKeys) })
  })

  it.each([
    ['SQL failure', 'CREATE TABLE rollback_probe (id TEXT); INSERT INTO missing_table VALUES (1);'],
    ['foreign key failure', 'CREATE TABLE rollback_probe (id TEXT REFERENCES project(id)); INSERT INTO rollback_probe VALUES (\'missing\');'],
  ])('rolls back every change and restores foreign keys after %s', async (_reason, sql) => {
    const database = new DatabaseSync(':memory:')
    databases.push(database)
    database.exec(migrations['20261113135519'])
    const changes = await new MigrationProvider(database, { invalid: sql }).getMigrations()
    await expect(changes.invalid.up(undefined as never)).rejects.toThrow()
    expect(database.prepare('SELECT name FROM sqlite_master WHERE name = \'rollback_probe\'').all()).toEqual([])
    expect(database.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
})
