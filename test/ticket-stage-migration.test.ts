import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'

describe('ticket stage migration', () => {
  it('maps persisted waiting to idle for dispatched tickets and to queued for untouched ones', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(migrations['20261113135519'])
      database.exec(`
        INSERT INTO channel (id, name, createdAt) VALUES ('github', 'GitHub', '2026-11-24');
        INSERT INTO project (id, channelId, name, workspaceId, directory, createdAt, updatedAt)
          VALUES ('p', 'github', 'owner/repo', 'w', '/workspace', '2026-11-24', '2026-11-24');
        INSERT INTO ticket (id, projectId, channelId, title, status, createdAt, updatedAt)
          VALUES ('T-1', 'p', 'github', 'Ran once', 'waiting', '2026-11-24', '2026-11-24');
        INSERT INTO ticket (id, projectId, channelId, title, status, createdAt, updatedAt)
          VALUES ('T-2', 'p', 'github', 'Never dispatched', 'waiting', '2026-11-24', '2026-11-24');
        INSERT INTO worker (id, ticketId, status, createdAt) VALUES ('worker', 'T-1', 'ended', '2026-11-24');
      `)
      database.exec(migrations['20261124230000_ticket_stage'])
      expect(database.prepare('SELECT id, status FROM ticket ORDER BY id').all()).toEqual([
        { id: 'T-1', status: 'idle' },
        { id: 'T-2', status: 'queued' },
      ])
    }
    finally {
      database.close()
    }
  })
})
