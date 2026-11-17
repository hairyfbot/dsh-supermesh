import type { DB } from '../src/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrations } from '../src/database/migrations'
import { Project } from '../src/database/models/project'

import { project } from '../src/service/project'
import { worktree } from '../src/service/worktree'

const state = vi.hoisted(() => ({ db: {} as { project: Project }, workspaces: [] as { id: string, title: string, path: string, status: () => Promise<string> }[] }))
vi.mock('../src/database', () => ({ db: state.db }))
vi.mock('dsh-h3/utils', () => ({ getServerContext: () => ({ workspaceRegistry: { list: () => state.workspaces } }) }))
vi.mock('../src/server', () => ({ server: {} }))
vi.mock('../src/service/worktree', () => ({ worktree: { peek: vi.fn() } }))

let connection: Kysely<DB>

beforeEach(() => {
  const sqlite = new DatabaseSync(':memory:')
  for (const sql of Object.values(migrations)) sqlite.exec(sql)
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: sqlite }) })
  state.db.project = new Project(connection)
  state.workspaces = []
  vi.mocked(worktree.peek).mockReset()
})

afterEach(async () => {
  await connection.destroy()
  vi.restoreAllMocks()
})

describe('project workspace synchronization', () => {
  it('preserves human choices and session bindings while updating workspace facts', async () => {
    await state.db.project.create({ id: 'existing', workspaceId: 'w', name: 'Old title', directory: '/old', remoteUrl: 'https://github.com/o/old.git', enabled: 0, orchestratorSessionId: 'manager', createdAt: '2026-11-01', updatedAt: '2026-11-01' })
    state.workspaces = [{ id: 'w', title: 'New title', path: '/new', status: async () => 'ok' }]
    vi.mocked(worktree.peek).mockResolvedValue({ directory: '/new', remoteUrl: 'git@github.com:o/new.git' })
    const rows = await project.sync()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'existing', name: 'New title', enabled: 0, orchestratorSessionId: 'manager', directory: '/new', remoteUrl: 'git@github.com:o/new.git' })
  })

  it('discovers only available Git roots with remotes and keeps repeat discovery idempotent', async () => {
    state.workspaces = [
      { id: 'missing', title: 'Missing', path: '/missing', status: async () => 'missing-dir' },
      { id: 'plain', title: 'Plain', path: '/plain', status: async () => 'ok' },
      { id: 'local', title: 'Local', path: '/local', status: async () => 'ok' },
      { id: 'git', title: 'Git', path: '/git', status: async () => 'ok' },
    ]
    vi.mocked(worktree.peek).mockImplementation(async directory => directory === '/plain' ? null : { directory, remoteUrl: directory === '/local' ? null : 'https://github.com/o/repo.git' })
    await project.sync()
    const rows = await project.sync()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'git', workspaceId: 'git', remoteUrl: 'https://github.com/o/repo.git', enabled: 1 })
    expect(worktree.peek).not.toHaveBeenCalledWith('/missing')
  })

  it('shares an in-flight discovery and propagates inspection failures', async () => {
    state.workspaces = [{ id: 'w', title: 'W', path: '/w', status: async () => 'ok' }]
    vi.mocked(worktree.peek).mockRejectedValue(new Error('inspection_denied'))
    const first = project.sync()
    expect(project.sync()).toBe(first)
    await expect(first).rejects.toThrow('inspection_denied')
    expect(await state.db.project.listAll()).toEqual([])
  })
})
