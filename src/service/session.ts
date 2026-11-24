import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { realpathNormalize } from '@deepseek-ai/dsh-workspace'
import { getServerContext } from 'dsh-h3/utils'
import { DSH_PLUGIN_HOME, DSH_WORKSPACE_HOME } from '@/config/paths'
import { db } from '@/database'
import { singlet } from '@/runtime/singlet'
import { server } from '@/server'
import { inbox } from '@/service/inbox'
import { storage } from '@/storage'
import { defineService } from '@/utils/service'

type Role = 'main' | 'project' | 'supervisor' | 'worker'
interface Identity { role: Role, projectId?: string, supervisorId?: string, ticketId?: string, workerId?: string }
const presets = { main: 'orchestrator', project: 'manager', supervisor: 'supervisor', worker: 'worker' } as const

const registered = new Set<string>()
let controller = new AbortController()
let stopped = false

export const session = defineService({
  register(id: string): () => void {
    registered.add(id)
    return () => {
      registered.delete(id)
    }
  },
  /** 同步判定一个 Agent 是不是插件的四个角色会话：只按预设判断，不读会话历史。 */
  roleOf(agent: Agent): Role | null {
    const preset = getServerContext<Context>(server).agentPresets.composedPreset(agent.ctx)
    if (!preset || !registered.has(preset))
      return null
    return (Object.keys(presets) as Role[]).find(role => presets[role] === preset) ?? null
  },
  async attach(agent: Agent): Promise<Role | null> {
    const ctx = getServerContext<Context>(server)
    const preset = ctx.agentPresets.composedPreset(agent.ctx)
    if (!preset || !registered.has(preset) || agent.session.header.origin === 'subagent' || agent.session.header.parentSession || ctx.workspaceRegistry.archivedSessionIds.includes(agent.session.id))
      return null
    const role = (Object.keys(presets) as Role[]).find(role => presets[role] === preset)
    if (!role)
      return null
    if (role === 'main') {
      const current = await session.findMain()
      if (current && current !== agent.session.id)
        throw new Error('ambiguous_main_session')
    }
    await bindWorkspace(agent.session.id, agent.session.header.cwd)
    if (role === 'main')
      await storage.setItem('orchestrator.id', agent.session.id)
    return role
  },
  start(): () => Promise<void> {
    if (singlet.busy('session:workspace'))
      throw new Error('session_busy')
    controller = new AbortController()
    stopped = false
    return async () => {
      stopped = true
      controller.abort(new Error('session_stopped'))
      await Promise.allSettled([singlet.drain()])
    }
  },
  async resolve(id: string): Promise<Identity | null> {
    const ctx = getServerContext<Context>(server)
    const sid = SessionId(id)
    if (ctx.workspaceRegistry.archivedSessionIds.includes(sid))
      return null
    let header
    let preset
    try {
      const snapshot = await ctx.sessionQuery.readSession(sid)
      header = snapshot.session
      preset = ctx.agentPresets.presetForSession(Session.create(sid, snapshot.events, snapshot.session))
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND')
        return null
      throw error
    }
    if (!preset || !registered.has(preset) || header.origin === 'subagent' || header.parentSession)
      return null
    const [worker, project, supervisor] = await Promise.all([
      db.worker.findById(id),
      db.project.findBySession(id),
      db.supervisor.findBySession(id),
    ])
    if ([worker, project, supervisor].filter(Boolean).length > 1)
      throw new Error('session_binding_conflict')
    // 重启后会话日志还在、Agent 尚未 resume：这仍是同一个 Worker 会话，不能当成不存在。
    // 只有会话已归档、日志缺失或预设不符才算不可用，真正的激活由 resolveAgent 完成。
    if (worker) {
      const agent = ctx.agents.get(sid)
      if (preset !== presets.worker || (agent && ctx.agentPresets.composedPreset(agent.ctx) !== presets.worker))
        return null
      const ticket = await db.ticket.findById(worker.ticketId)
      return ticket ? { role: 'worker', projectId: ticket.projectId, ticketId: ticket.id, workerId: worker.id } : null
    }
    if (project)
      return preset === presets.project ? { role: 'project', projectId: project.id } : null
    if (supervisor)
      return preset === presets.supervisor && supervisor.status === 'active' ? { role: 'supervisor', supervisorId: supervisor.id } : null
    return preset === presets.main && await storage.getItem<string>('orchestrator.id') === id ? { role: 'main' } : null
  },
  /**
   * 按会话日志重建一个 Session 实例。没有活动 Agent 的票（Worker 已结束）也要能读
   * 它自己的投影 —— 官方 forge-session 的绑定正是从这份日志折出来的。
   */
  async instance(id: string): Promise<Session | null> {
    const ctx = getServerContext<Context>(server)
    const sid = SessionId(id)
    if (ctx.workspaceRegistry.archivedSessionIds.includes(sid))
      return null
    try {
      const snapshot = await ctx.sessionQuery.readSession(sid)
      return Session.create(sid, snapshot.events, snapshot.session)
    }
    catch {
      return null
    }
  },
  async findMain(): Promise<string | null> {
    const id = await storage.getItem<string>('orchestrator.id')
    return id && (await session.resolve(id))?.role === 'main' ? id : null
  },
  create: singlet(
    (role, options) => `session:create:${role}:${role === 'worker' ? options.sessionId : role === 'project' ? options.projectId : role === 'supervisor' ? options.supervisorId : 'main'}`,
    async (role: Role, options: { sessionId?: string, projectId?: string, supervisorId?: string, ticketId?: string, directory?: string, title?: string, prompt?: string }): Promise<string> => {
      if (stopped)
        throw new Error('runtime_stopping')

      const ctx = getServerContext<Context>(server)
      const project = options.projectId ? await db.project.findById(options.projectId) : undefined
      const supervisor = options.supervisorId ? await db.supervisor.findById(options.supervisorId) : undefined
      if (role === 'project' && !project)
        throw new Error('project_not_found')
      if (role === 'supervisor' && (!supervisor || supervisor.status !== 'active'))
        throw new Error('supervisor_not_active')
      if (role === 'main') {
        const existing = await session.findMain()
        if (existing) {
          await bindWorkspace(existing)
          await ctx.workspaceRegistry.pinSession(SessionId(existing)).catch(() => undefined)
          return existing
        }
      }
      if (role === 'project' && project?.orchestratorSessionId) {
        const identity = await session.resolve(project.orchestratorSessionId)
        if (identity?.role === 'project' && identity.projectId === project.id) {
          await bindWorkspace(project.orchestratorSessionId)
          return project.orchestratorSessionId
        }
        if (identity)
          throw new Error('session_binding_conflict')
      }
      if (role === 'supervisor' && supervisor?.sessionId) {
        const identity = await session.resolve(supervisor.sessionId)
        if (identity?.role === 'supervisor' && identity.supervisorId === supervisor.id) {
          await bindWorkspace(supervisor.sessionId)
          return supervisor.sessionId
        }
        if (identity)
          throw new Error('session_binding_conflict')
      }
      const requestedId = options.sessionId ?? randomUUID()
      if (role === 'worker') {
        const worker = await db.worker.findById(requestedId)
        if (!worker || worker.ticketId !== options.ticketId || worker.status === 'ended')
          throw new Error('worker_binding_required')
        if (!options.directory)
          throw new Error('worker_directory_required')
      }
      const location = role === 'worker'
        ? { cwd: options.directory! }
        : { workspaceId: (await session.workspace()).id }
      const created = await ctx.sessionController.create({ sessionId: SessionId(requestedId), ...location, agentPreset: presets[role] })
      const id = created.sessionId
      if (id !== requestedId)
        throw new Error('session_identity_conflict')
      if (role === 'main')
        await storage.setItem('orchestrator.id', id)
      if (project && role === 'project')
        await db.project.setOrchestrator(project.id, id, new Date().toISOString())
      if (supervisor && role === 'supervisor')
        await db.supervisor.attachSession(supervisor.id, id)
      const title = role === 'main' ? '[路由] 主编排' : role === 'project' ? `[路由] ${project!.name}` : role === 'supervisor' ? `[协调] ${supervisor!.title}` : undefined
      if (title)
        await ctx.sessionController.rename({ sessionId: id, title })
      if (role === 'main')
        await ctx.workspaceRegistry.pinSession(SessionId(id)).catch(() => undefined)
      if (role !== 'worker')
        await inbox.notify(await resolveAgent(id))
      if (options.prompt)
        await session.send(id, options.prompt)
      return id
    },
  ),
  send: singlet(
    // key 必须带上正文摘要：worker 派工传的是固定 requestId，只按 id+requestId 去重会把
    // 第二轮及以后的所有 prompt 都判成重复投递，Worker 永远只收到第一条。
    (id, text, _mode, requestId = '') => `session:send:${id}:${requestId}:${text.length}:${text.slice(0, 64)}`,
    async (id: string, text: string, mode: 'queue' | 'interrupt' | 'reply' | 'wake' = 'queue', requestId: string = randomUUID()): Promise<string> => {
      if (!text.trim())
        throw new Error('empty_message')
      if (stopped)
        throw new Error('runtime_stopping')
      const identity = await session.resolve(id)
      // worker.status === 'ended' 只是「这一轮跑完了」，会话还在就还能续：把它当成不可投递
      // 会让答案、追问在 Worker 结束后全部丢失。真正投不出去的是会话已归档（resolve 不到）。
      if (!identity)
        throw new Error(await db.worker.findById(id) ? 'worker_session_unavailable' : 'unknown_session')
      const ctx = getServerContext<Context>(server)
      if (mode === 'interrupt')
        await session.cancel(id, true)
      // 与官方 sendWaking 一致：运行中 steer 到下一步，空闲时 queue 开新回合。
      const live = ctx.agents.get(SessionId(id))
      const target = mode === 'interrupt'
        ? 'steer'
        : mode === 'queue' || live?.status !== 'running'
          ? 'queue'
          : 'steer'
      const admitted = await ctx.sessionController.prompt({
        sessionId: SessionId(id),
        requestId: requestId as SessionRequestId,
        mode: target,
        content: [{ type: 'text', text }],
      }, controller.signal)
      // prompt 以 RemoteResult 返回失败，不抛异常；不检查就会静默丢消息，
      // 派工侧看到的是「成功」，票却永远等不到这一轮。
      if (admitted && typeof admitted === 'object' && 'ok' in admitted && admitted.ok === false)
        throw new Error(`prompt_rejected: ${String((admitted as { error?: unknown }).error ?? 'unknown')}`)
      return requestId
    },
  ),
  async cancel(id: string, keepInbox = false): Promise<void> {
    const agent = await resolveAgent(id)
    agent.cancel({ kind: 'hook', reason: 'supermesh_cancel' }, { keepInbox })
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
  workspace: singlet('session:workspace', async () => {
    const ctx = getServerContext<Context>(server)
    await mkdir(DSH_WORKSPACE_HOME, { recursive: true })
    await retireLegacyWorkspace(ctx)
    return ctx.workspaceRegistry.create(DSH_WORKSPACE_HOME, '代理工作区')
  }),
  // 不能用 singlet 缓存：worker 每轮结束后会话是 end-seed，复用同一 worker 时必须重新
  // resolveAgent 才能续上。缓存会把上一轮已结束的 Agent 一直返回，新一轮 prompt 无处可投。
  activate: (id: string) => resolveAgent(id),
  async lookup(id: string): Promise<Agent | null> {
    if (!(await session.resolve(id)))
      return null
    return getServerContext<Context>(server).agents.get(SessionId(id)) ?? null
  },
  async history(id: string) {
    return getServerContext<Context>(server).sessionQuery.readSession(SessionId(id))
  },
  async lastActivity(id: string): Promise<number | null> {
    try {
      const { events } = await getServerContext<Context>(server).sessionQuery.readSession(SessionId(id))
      let latest = 0
      for (const event of events) {
        const time = Number((event as { time?: number }).time ?? 0)
        if (time > latest)
          latest = time
      }
      return latest || null
    }
    catch {
      return null
    }
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
      result.agent.cancel({ kind: 'hook', reason: 'supermesh_stop' }, { keepInbox: true })
      await result.agent.whenIdle()
    }
    if ((await session.activity(id)).background)
      throw new Error('background_stop_pending')
  },
})

/**
 * 旧版本把「代理工作区」注册在 `.supermesh` 根本身，那里同时存着插件状态。
 * 工作区路径不可改，只能删掉这条注册；目录与会话日志都保留，旧会话退化为未分组。
 */
async function retireLegacyWorkspace(ctx: Context): Promise<void> {
  const legacy = await realpathNormalize(DSH_PLUGIN_HOME).catch(() => undefined)
  if (!legacy)
    return
  for (const workspace of ctx.workspaceRegistry.list()) {
    if (workspace.path === legacy)
      await ctx.workspaceRegistry.delete(workspace.id).catch(() => undefined)
  }
}

async function bindWorkspace(id: string, cwd?: string): Promise<void> {
  const ctx = getServerContext<Context>(server)
  const sid = SessionId(id)
  const directory = cwd ?? (await ctx.sessionQuery.readSession(sid)).session.cwd
  if (!directory)
    return
  const actual = await realpathNormalize(directory).catch(() => undefined)
  if (!actual)
    return
  // `.supermesh` 根只放插件状态：旧会话的 cwd 停在这里，自动挂载不能再把它注册成工作区，
  // 否则侧栏会多出一条与插件数据共树的同类条目。
  if (actual === await realpathNormalize(DSH_PLUGIN_HOME).catch(() => undefined))
    return
  for (const workspace of [await session.workspace(), ...ctx.workspaceRegistry.list()]) {
    if (workspace.sessionIds.includes(sid))
      return
    if (workspace.path !== actual)
      continue
    await workspace.attachSession(sid).catch(() => undefined)
    return
  }
  const created = await ctx.workspaceRegistry.create(actual, basename(actual)).catch(() => undefined)
  await created?.attachSession(sid).catch(() => undefined)
}

async function resolveAgent(id: string): Promise<Agent> {
  if (!(await session.resolve(id)))
    throw new Error('unknown_session')
  const result = await getServerContext<Context>(server).sessionController.resolveAgent(SessionId(id))
  if ('error' in result)
    throw result.error
  return result.agent
}
