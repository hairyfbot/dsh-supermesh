import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '@/database'
import { archive } from '@/service/archive'
import { session } from '@/service/session'

export const supervisor_list = defineTool({
  name: 'supervisor_list',
  description: '列全部 Supervisor，字段完整：标题、原因、状态、关联工单、各自进度。',
  parameters: {
    status: {
      type: 'string',
      enum: ['active', 'closed'],
      description: '只看在协调中的或已收工的；省略表示只看 active。',
    },
  },
  output: {
    schema: { type: 'string', description: 'Supervisor 列表，含 title / reason / status / 关联工单。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    const rows = await db.supervisor.listByStatus(args.status ?? 'active')
    return JSON.stringify(await Promise.all(rows.map(async row => ({ ...row, tickets: await Promise.all((await db.supervisorTicket.listBySupervisor(row.id)).map(link => db.ticket.findById(link.ticketId))) }))))
  },
})

export const create_supervisor = defineTool({
  name: 'create_supervisor',
  description: '跨项目时拉起一个临时协调者：建记录并起会话，把双方上下文写进开场。',
  parameters: {
    title: {
      type: 'string',
      required: true,
      description: '一句话说明它在协调什么，例如「T-105 需要 B/x 配合」。',
    },
    reason: {
      type: 'string',
      required: true,
      description: '为什么拉起来，写清卡在哪，方便事后回溯。',
    },
    ticketIds: {
      type: 'array',
      items: { type: 'string' },
      required: true,
      description: '它协调的那几张票，通常每个项目一张。',
    },
  },
  output: {
    schema: { type: 'string', description: '新 Supervisor 的 id 与关联工单。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    const ticketIds = [...new Set(args.ticketIds)]
    if (!ticketIds.length)
      throw new Error('至少需要一张工单')
    const tickets = await Promise.all(ticketIds.map(id => db.ticket.requireOpen(id)))
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.supervisor.create({ id, title: args.title, reason: args.reason, status: 'active', sessionId: null, createdAt: now, closedAt: null })
    for (const ticketId of ticketIds) await db.supervisorTicket.link(id, ticketId, now)
    const sessionId = await session.create('supervisor', { supervisorId: id, title: args.title })
    await db.supervisor.attachSession(id, sessionId)
    await session.send(sessionId, JSON.stringify({ title: args.title, reason: args.reason, tickets }), 'queue')
    return JSON.stringify({ id, sessionId, ticketIds })
  },
})

export const close_supervisor = defineTool({
  name: 'close_supervisor',
  description: '关掉 Supervisor：status=closed，关联工单退回各自项目编排。reason 会原样进每个持票项目编排的收件箱。',
  parameters: {
    supervisorId: {
      type: 'string',
      required: true,
      description: '要关掉的 Supervisor。',
    },
    reason: {
      type: 'string',
      required: true,
      description: '为什么关。会原样进每个关联工单所属项目编排的收件箱 —— 它们要凭这句话决定那几张票接下来怎么办。写清是「做完了」还是「不做了、各自收摊」。',
    },
  },
  output: {
    schema: { type: 'string', description: '关闭结果，含通知到哪几个项目编排。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    const row = await db.supervisor.findById(args.supervisorId)
    if (!row)
      throw new Error('Supervisor 不存在')
    if (row.status === 'closed')
      return JSON.stringify({ id: row.id, status: 'closed', notified: [] })
    const tickets = await Promise.all((await db.supervisorTicket.listBySupervisor(row.id)).map(link => db.ticket.findById(link.ticketId)))
    const projects = [...new Set(tickets.flatMap(ticket => ticket ? [ticket.projectId] : []))]
    for (const projectId of projects) await db.inbox.enqueue({ id: `supervisor-close:${row.id}:${projectId}`, type: 'project', projectId, supervisorId: row.id, origin: 'main', kind: 'notice', title: row.title, message: `${args.reason}\n${tickets.filter(ticket => ticket?.projectId === projectId).map(ticket => ticket!.id).join(', ')}` })
    await db.supervisor.close(row.id, new Date().toISOString())
    if (row.sessionId)
      await archive.session(row.sessionId)
    return JSON.stringify({ id: row.id, status: 'closed', notified: projects })
  },
})

export const attach_tickets_to_supervisor = defineTool({
  name: 'attach_tickets_to_supervisor',
  description: '扩大 Supervisor 的范围：加关联工单，并自动通知该项目编排。',
  parameters: {
    supervisorId: {
      type: 'string',
      required: true,
      description: '要扩范围的 Supervisor。',
    },
    ticketIds: {
      type: 'array',
      items: { type: 'string' },
      required: true,
      description: '要加进去的票。',
    },
  },
  output: {
    schema: { type: 'string', description: '扩范围结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    const row = await db.supervisor.findById(args.supervisorId)
    if (!row || row.status !== 'active')
      throw new Error('Supervisor 不存在或已关闭')
    const tickets = await Promise.all([...new Set(args.ticketIds)].map(id => db.ticket.requireOpen(id)))
    const existing = await db.supervisorTicket.listBySupervisor(row.id)
    const added = tickets.filter(ticket => !existing.some(link => link.ticketId === ticket.id))
    for (const ticket of added) await db.supervisorTicket.link(row.id, ticket.id, new Date().toISOString())
    for (const projectId of new Set(added.map(ticket => ticket.projectId))) await db.inbox.enqueue({ type: 'project', projectId, supervisorId: row.id, origin: 'main', kind: 'notice', title: row.title, message: `加入 Supervisor ${row.id}: ${added.filter(ticket => ticket.projectId === projectId).map(ticket => ticket.id).join(', ')}` })
    return JSON.stringify({ attached: added.map(ticket => ticket.id) })
  },
})

export const detach_tickets_from_supervisor = defineTool({
  name: 'detach_tickets_from_supervisor',
  description: '缩小 Supervisor 的范围：去掉关联工单，退回原项目，并自动通知该项目编排。**不取消** —— 取消是人的决定。',
  parameters: {
    supervisorId: {
      type: 'string',
      required: true,
      description: '要缩范围的 Supervisor。',
    },
    ticketIds: {
      type: 'array',
      items: { type: 'string' },
      required: true,
      description: '要退回原项目的票。',
    },
    reason: {
      type: 'string',
      required: true,
      description: '为什么摘出来。会进退回票所属项目编排的收件箱 —— 它要凭这句话知道那张票现在归谁管、还要不要继续等。',
    },
  },
  output: {
    schema: { type: 'string', description: '缩范围结果，含通知到哪几个项目编排。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    const row = await db.supervisor.findById(args.supervisorId)
    if (!row)
      throw new Error('Supervisor 不存在')
    const existing = await db.supervisorTicket.listBySupervisor(row.id)
    const ids = [...new Set(args.ticketIds)].filter(id => existing.some(link => link.ticketId === id))
    const tickets = await Promise.all(ids.map(id => db.ticket.findById(id)))
    for (const ticketId of ids) await db.supervisorTicket.unlink(row.id, ticketId)
    for (const projectId of new Set(tickets.flatMap(ticket => ticket ? [ticket.projectId] : []))) await db.inbox.enqueue({ type: 'project', projectId, supervisorId: row.id, origin: 'main', kind: 'notice', title: row.title, message: `${args.reason}\n${tickets.filter(ticket => ticket?.projectId === projectId).map(ticket => ticket!.id).join(', ')}` })
    return JSON.stringify({ detached: ids })
  },
})
