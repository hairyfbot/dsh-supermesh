import type { Context } from '@deepseek-ai/cordis'
import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { getServerContext } from 'dsh-h3/utils'
import { DSH_PLUGIN_HOME } from '@/config/paths'
import { db } from '@/database'
import { server } from '@/server'
import { worktree } from '@/service/worktree'
import { parseGitRemote } from '@/utils/repository'
import { defineService } from '@/utils/service'

let syncing: Promise<Selectable<DB['project']>[]> | undefined
let controller = new AbortController()
let stopped = false
const repositories = new Map<string, Promise<{ project: Selectable<DB['project']>, workspaceId: string }>>()

export const project = defineService({
  start(): () => Promise<void> {
    if (repositories.size || syncing)
      throw new Error('project_busy')
    controller = new AbortController()
    stopped = false
    return async () => {
      stopped = true
      controller.abort(new Error('project_stopped'))
      await Promise.allSettled([...repositories.values(), ...(syncing ? [syncing] : [])])
    }
  },
  async list(): Promise<(Selectable<DB['project']> & { available?: boolean })[]> {
    const rows = await db.project.listAll()
    const workspaces = getServerContext<Context>(server).workspaceRegistry.list()
    return Promise.all(rows.map(async (current) => {
      const workspace = workspaces.find(workspace => workspace.id === current.workspaceId)
      const facts = workspace && await workspace.status() === 'ok' ? await repositoryFacts(workspace.path) : null
      return { ...current, available: Boolean(facts?.remoteUrl && samePath(facts.directory, current.directory) && facts.remoteUrl === current.remoteUrl) }
    }))
  },
  addRepository(remoteUrl: string, name?: string, signal?: AbortSignal): Promise<{ project: Selectable<DB['project']>, workspaceId: string }> {
    return addRepository(remoteUrl, name, signal)
  },
  async open(id: string, signal: AbortSignal): Promise<{ opened: true }> {
    const current = await db.project.findById(id)
    if (!current)
      throw new Error('project_not_found')
    const ctx = getServerContext<Context>(server)
    if (!ctx.sessionController.canOpenWorkspacePath())
      throw new Error('native_open_unavailable')
    return ctx.sessionController.openWorkspacePath({ path: current.directory }, signal)
  },
  sync(): Promise<Selectable<DB['project']>[]> {
    if (stopped)
      return Promise.reject(new Error('project_stopped'))
    return queueSync()
  },
})

async function addRepository(remoteUrl: string, name?: string, requestSignal?: AbortSignal): Promise<{ project: Selectable<DB['project']>, workspaceId: string }> {
  if (stopped)
    throw new Error('project_stopped')
  const signal = requestSignal ? AbortSignal.any([controller.signal, requestSignal]) : controller.signal
  const remote = parseGitRemote(remoteUrl)
  const platform = remote.host === 'github.com' ? 'github' : remote.host
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 200 || [...name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)))
    throw new Error('invalid_workspace_name')
  const active = repositories.get(remote.webUrl)
  if (active)
    return active
  const task = (async () => {
    signal?.throwIfAborted()
    const registry = getServerContext<Context>(server).workspaceRegistry
    let directory: string | undefined
    for (const workspace of registry.list()) {
      if (await workspace.status() !== 'ok')
        continue
      const facts = await repositoryFacts(workspace.path)
      if (facts?.remoteUrl === remote.webUrl) {
        directory = facts.directory
        break
      }
    }
    if (!directory) {
      const target = join(DSH_PLUGIN_HOME, 'repositories', platform, remote.host.replace(':', '_'), remote.owner, remote.name)
      try {
        directory = (await worktree.clone(remote.remoteUrl, resolve(target), undefined, signal)).directory
      }
      catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
          throw new Error('repository_clone_cancelled')
        if (error instanceof Error && ['repository_path_conflict', 'repository_remote_mismatch', 'worktree_stopped'].includes(error.message))
          throw error
        if (error instanceof Error && 'killed' in error && error.killed)
          throw new Error('repository_clone_timeout')
        throw new Error('repository_clone_failed')
      }
    }
    signal.throwIfAborted()
    if (parseGitRemote(remoteUrl).webUrl !== remote.webUrl || (await repositoryFacts(directory))?.remoteUrl !== remote.webUrl)
      throw new Error('repository_remote_mismatch')
    signal.throwIfAborted()
    const workspace = await registry.create(directory, name?.trim() ?? `${platform}/${remote.name}`)
    await queueSync()
    const current = await db.project.findByWorkspace(workspace.id)
    if (!current)
      throw new Error('repository_registration_failed')
    return { project: current, workspaceId: workspace.id }
  })().finally(() => repositories.delete(remote.webUrl))
  repositories.set(remote.webUrl, task)
  return task
}

function queueSync(): Promise<Selectable<DB['project']>[]> {
  const task = (syncing ? syncing.then(synchronize, synchronize) : synchronize()).finally(() => {
    if (syncing === task)
      syncing = undefined
  })
  syncing = task
  return task
}

async function synchronize(): Promise<Selectable<DB['project']>[]> {
  const registry = getServerContext<Context>(server).workspaceRegistry
  const available: string[] = []
  const now = new Date().toISOString()
  for (const workspace of registry.list()) {
    if (await workspace.status() !== 'ok')
      continue
    const facts = await repositoryFacts(workspace.path)
    if (!facts)
      continue
    const current = await db.project.findByWorkspace(workspace.id)
    if (!current && !facts.remoteUrl)
      continue
    if (facts.remoteUrl)
      available.push(workspace.id)
    await db.project.upsertWorkspace({
      id: current?.id ?? workspace.id,
      workspaceId: workspace.id,
      name: workspace.title,
      directory: facts.directory,
      remoteUrl: facts.remoteUrl,
    }, now)
  }
  await db.project.disableUnavailable(available, now)
  return db.project.listAll()
}

async function repositoryFacts(directory: string): Promise<{ directory: string, remoteUrl: string | null } | null> {
  let facts: Awaited<ReturnType<typeof worktree.peek>>
  try {
    facts = await worktree.peek(directory)
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
  if (!facts?.remoteUrl)
    return facts
  try {
    return { ...facts, remoteUrl: parseGitRemote(facts.remoteUrl).webUrl }
  }
  catch { return { ...facts, remoteUrl: null } }
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right)
}
