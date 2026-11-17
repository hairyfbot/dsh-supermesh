import type { DB } from '../src/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '../src/database/migrations'
import { Project } from '../src/database/models/project'

const now = '2026-11-17T00:00:00.000Z'
let connection: Kysely<DB>
let project: Project

beforeEach(() => {
  const sqlite = new DatabaseSync(':memory:')
  for (const [, migration] of Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b))) sqlite.exec(migration)
  sqlite.exec('PRAGMA foreign_keys = ON')
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: sqlite }) })
  project = new Project(connection)
})

afterEach(async () => {
  await connection.destroy()
})

function workspace(id: string, remoteUrl: string | null = 'https://github.com/org/repository.git') {
  return { id, workspaceId: `workspace-${id}`, name: 'Same display title', directory: `/isolated/${id}`, remoteUrl }
}

describe('workspace synchronization persistence', () => {
  it('removing an origin disables an existing project without losing its identity or session history binding', async () => {
    const original = await project.upsertWorkspace(workspace('first'), now)
    await project.setOrchestrator(original.id, 'historical-session', now)
    const updated = await project.upsertWorkspace(workspace('first', null), '2026-11-18T00:00:00.000Z')
    expect(updated).toMatchObject({ id: original.id, enabled: 0, remoteUrl: null, orchestratorSessionId: 'historical-session', createdAt: now })
    expect(await project.listAll()).toHaveLength(1)
  })

  it('a valid remote returning never silently re-enables a manually or automatically disabled project', async () => {
    await project.upsertWorkspace(workspace('manual'), now)
    await project.setEnabled('manual', false, now)
    await project.upsertWorkspace({ ...workspace('manual'), name: 'Renamed' }, now)
    expect(await project.findById('manual')).toMatchObject({ enabled: 0, name: 'Renamed' })
  })

  it('missing workspace identities are disabled while same-name active workspaces and every history row survive', async () => {
    await project.upsertWorkspace(workspace('removed'), now)
    await project.upsertWorkspace(workspace('present'), now)
    await project.setOrchestrator('removed', 'old-session', now)
    await project.disableUnavailable(['workspace-present'], now)
    expect(await project.findById('removed')).toMatchObject({ enabled: 0, orchestratorSessionId: 'old-session' })
    expect(await project.findById('present')).toMatchObject({ enabled: 1 })
    expect(await project.listAll()).toHaveLength(2)
    await project.disableUnavailable([], now)
    expect((await project.listAll()).map(row => row.enabled)).toEqual([0, 0])
  })
})

describe('repository remote security', () => {
  it('new projects without a usable remote start disabled', async () => {
    expect(await project.upsertWorkspace(workspace('empty', null), now)).toMatchObject({ enabled: 0 })
  })
})
