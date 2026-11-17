import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { getServerContext } from 'dsh-h3/utils'
import { DSH_PLUGIN_HOME } from '../config/paths'
import { db } from '../database'
import { server } from '../server'
import { defineService } from '../utils/service'

type Role = 'main' | 'project' | 'supervisor' | 'worker'
interface Identity { role: Role, projectId?: string, supervisorId?: string, ticketId?: string, workerId?: string }
const presets = { main: 'orchestrator', project: 'manager', supervisor: 'supervisor', worker: 'worker' } as const

const operations = new Map<string, Promise<unknown>>()
let controller = new AbortController()
let stopped = false

export const session = defineService({
  start(): () => Promise<void> {
    if (operations.size)
      throw new Error('session_busy')
    controller = new AbortController()
    stopped = false
    return async () => {
      stopped = true
      controller.abort(new Error('session_stopped'))
      await Promise.allSettled([...operations.values()])
    }
  },
  async resolve(id: string): Promise<Identity | null> {
    const ctx = getServerContext<Context>(server)
    const sid = SessionId(id)
    if (ctx.workspaceRegistry.archivedSessionIds.includes(sid))
      return null
    let header
    try {
      header = (await ctx.sessionQuery.readSession(sid)).session
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND')
        return null
      throw error
    }
    if (header.origin === 'subagent' || header.parentSession)
      return null
    const [worker, project, supervisor] = await Promise.all([
      db.worker.findById(id),
      db.project.findBySession(id),
      db.supervisor.findBySession(id),
    ])
    if ([worker, project, supervisor].filter(Boolean).length > 1)
      throw new Error('session_binding_conflict')
    if (worker) {
      if (header.agentPreset !== presets.worker)
        return null
      const ticket = await db.ticket.findById(worker.ticketId)
      return ticket ? { role: 'worker', projectId: ticket.projectId, ticketId: ticket.id, workerId: worker.id } : null
    }
    if (project)
      return header.agentPreset === presets.project ? { role: 'project', projectId: project.id } : null
    if (supervisor)
      return header.agentPreset === presets.supervisor && supervisor.status === 'active' ? { role: 'supervisor', supervisorId: supervisor.id } : null
    return header.agentPreset === presets.main ? { role: 'main' } : null
  },
  async findMain(): Promise<string | null> {
    const ctx = getServerContext<Context>(server)
    const records = await ctx.sessionQuery.listSessions()
    const candidates = records.filter(({ header }) => header.agentPreset === presets.main && !header.parentSession && header.origin !== 'subagent' && !ctx.workspaceRegistry.archivedSessionIds.includes(header.id))
    if (candidates.length > 1)
      throw new Error('ambiguous_main_session')
    return candidates[0]?.header.id ?? null
  },
  async create(role: Role, options: { sessionId?: string, projectId?: string, supervisorId?: string, ticketId?: string, directory?: string, title?: string, prompt?: string }): Promise<string> {
    if (stopped)
      throw new Error('runtime_stopping')
    return run(`session:create:${role}:${role === 'worker' ? options.sessionId : role === 'project' ? options.projectId : role === 'supervisor' ? options.supervisorId : 'main'}`, async () => {
      const ctx = getServerContext<Context>(server)
      const project = options.projectId ? await db.project.findById(options.projectId) : undefined
      const supervisor = options.supervisorId ? await db.supervisor.findById(options.supervisorId) : undefined
      if (role === 'project' && !project)
        throw new Error('project_not_found')
      if (role === 'supervisor' && (!supervisor || supervisor.status !== 'active'))
        throw new Error('supervisor_not_active')
      const requestedId = options.sessionId ?? randomUUID()
      if (role === 'worker') {
        const worker = await db.worker.findById(requestedId)
        if (!worker || worker.ticketId !== options.ticketId || worker.status === 'ended')
          throw new Error('worker_binding_required')
      }
      const directory = options.directory ?? project?.directory ?? join(DSH_PLUGIN_HOME, 'sessions', requestedId)
      await mkdir(directory, { recursive: true })
      const created = await ctx.sessionController.create({ sessionId: SessionId(requestedId), cwd: directory, agentPreset: presets[role] })
      const id = created.sessionId
      if (id !== requestedId)
        throw new Error('session_identity_conflict')
      if (project && role === 'project')
        await db.project.setOrchestrator(project.id, id, new Date().toISOString())
      if (supervisor && role === 'supervisor')
        await db.supervisor.attachSession(supervisor.id, id)
      if (options.title)
        await ctx.sessionController.rename({ sessionId: id, title: options.title })
      if (options.prompt)
        await session.send(id, options.prompt)
      return id
    })
  },
  async send(id: string, text: string, mode: 'queue' | 'interrupt' | 'reply' = 'queue', requestId: string = randomUUID()): Promise<void> {
    if (!text.trim())
      throw new Error('empty_message')
    if (stopped)
      throw new Error('runtime_stopping')
    return run(`session:send:${id}:${requestId}`, async () => {
      const identity = await session.resolve(id)
      if (!identity)
        throw new Error('unknown_session')
      if (identity.workerId && (await db.worker.findById(id))?.status === 'ended')
        throw new Error('worker_ended')
      const ctx = getServerContext<Context>(server)
      if (mode === 'interrupt')
        await session.cancel(id, true)
      await ctx.sessionController.prompt({
        sessionId: SessionId(id),
        requestId: requestId as SessionRequestId,
        mode: mode === 'queue' ? 'queue' : 'steer',
        content: [{ type: 'text', text }],
      }, controller.signal)
    })
  },
  async cancel(id: string, keepInbox = false): Promise<void> {
    const agent = await resolveAgent(id)
    agent.cancel({ kind: 'hook', reason: 'nexus_cancel' }, { keepInbox })
  },
  async rename(id: string, title: string): Promise<void> {
    if (!(await session.resolve(id)))
      throw new Error('unknown_session')
    await getServerContext<Context>(server).sessionController.rename({ sessionId: SessionId(id), title })
  },
  async view(id: string, offset = 0, limit = 12000): Promise<{ text: string, next_offset: number | null }> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50000)
      throw new Error('invalid_page')
    if (!(await session.resolve(id)))
      throw new Error('unknown_session')
    const { events } = await getServerContext<Context>(server).sessionQuery.readSession(SessionId(id))
    const text = events.flatMap((event) => {
      if (event.type !== 'user/message' && event.type !== 'assistant/message')
        return []
      const message = event.type === 'assistant/message' ? event.data.message : event.data
      return message.content.flatMap(part => part.type === 'text' ? [part.text] : [])
    }).join(String.fromCharCode(10, 10))
    const end = Math.min(text.length, offset + limit)
    return { text: text.slice(offset, end), next_offset: end < text.length ? end : null }
  },
  async receipts(id: string): Promise<{ requestId: string, consumedAt: string }[]> {
    const { events } = await getServerContext<Context>(server).sessionQuery.readSession(SessionId(id))
    const receipts: { requestId: string, consumedAt: string }[] = []
    let pending: string[] = []
    for (const event of events) {
      if (event.type === 'turn/start')
        pending = []
      if (event.type === 'user/message' && 'rpcId' in event.data.source && typeof event.data.source.rpcId === 'string')
        pending.push(event.data.source.rpcId)
      if (event.type === 'turn/end' && event.data.reason.kind === 'completed') {
        receipts.push(...pending.map(requestId => ({ requestId, consumedAt: new Date(event.time).toISOString() })))
        pending = []
      }
    }
    return receipts
  },
  async activity(id: string): Promise<{ running: boolean, background: boolean, queued: boolean }> {
    const ctx = getServerContext<Context>(server)
    const activities = await ctx.waterfall('workspace/session-activity', { sessionId: SessionId(id) }, () => Promise.resolve([]))
    const state = await ctx.sessionController.state({ sessionId: SessionId(id) }, controller.signal)
    return { running: state.running, background: activities.some(item => String(item.kind) !== 'turn'), queued: Boolean(state.queue?.length) }
  },
  async stop(id: string): Promise<void> {
    const ctx = getServerContext<Context>(server)
    await ctx.parallel('workspace/session-stop', { sessionId: SessionId(id) })
    const result = await ctx.sessionController.resolveAgent(SessionId(id))
    if ('agent' in result) {
      result.agent.cancel({ kind: 'hook', reason: 'nexus_stop' }, { keepInbox: true })
      await result.agent.whenIdle()
    }
    if ((await session.activity(id)).background)
      throw new Error('background_stop_pending')
  },
})

async function resolveAgent(id: string): Promise<Agent> {
  if (!(await session.resolve(id)))
    throw new Error('unknown_session')
  const result = await getServerContext<Context>(server).sessionController.resolveAgent(SessionId(id))
  if ('error' in result)
    throw result.error
  return result.agent
}

function run<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (stopped)
    return Promise.reject(new Error('runtime_stopping'))
  const current = operations.get(key)
  if (current)
    return current as Promise<T>
  const task = Promise.resolve().then(action).finally(() => operations.delete(key))
  operations.set(key, task)
  return task
}
