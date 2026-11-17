import type { Context } from '@deepseek-ai/cordis'
import type { Selectable } from 'kysely'
import type { DB } from '../database/types'
import { getServerContext } from 'dsh-h3/utils'
import { db } from '../database'
import { server } from '../server'
import { defineService } from '../utils/service'
import { worktree } from './worktree'

let syncing: Promise<Selectable<DB['project']>[]> | undefined

export const project = defineService({
  sync(): Promise<Selectable<DB['project']>[]> {
    if (syncing)
      return syncing
    syncing = synchronize().finally(() => {
      syncing = undefined
    })
    return syncing
  },
})

async function synchronize(): Promise<Selectable<DB['project']>[]> {
  const registry = getServerContext<Context>(server).workspaceRegistry
  for (const workspace of registry.list()) {
    if (await workspace.status() !== 'ok')
      continue
    const facts = await worktree.peek(workspace.path)
    if (!facts)
      continue
    const current = await db.project.findByWorkspace(workspace.id)
    if (!current && !facts.remoteUrl)
      continue
    await db.project.upsertWorkspace({
      id: current?.id ?? workspace.id,
      workspaceId: workspace.id,
      name: workspace.title,
      directory: facts.directory,
      remoteUrl: facts.remoteUrl,
    }, new Date().toISOString())
  }
  return db.project.listAll()
}
