import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '@/database'
import { session } from '@/service/session'
import { worker as workerService } from '@/service/worker'

export const list_ticket = defineTool({
  name: 'list_ticket',
  description: '列本项目的任务。判重时必看。',
  parameters: {
    status: {
      type: 'string',
      enum: ['queued', 'running', 'idle', 'review', 'done', 'completed', 'cancelled'],
      description: '只看某个状态；省略表示不含已终态的票。',
    },
    attentionOnly: {
      type: 'boolean',
      description: 'true 时只返回存在指向它的 pending ask 的票。',
    },
  },
  output: {
    schema: { type: 'string', description: '本项目任务列表：id、标题、状态、PR 状态、有无 pending ask。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    return JSON.stringify(await db.ticket.listFiltered({ ...args, projectId: identity.projectId }))
  },
})

export const link_ticket = defineTool({
  name: 'link_ticket',
  description: '建一张工单到另一张工单的关联。限本项目；跨项目依赖由 Supervisor 的 link_dependency 记。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '发起关联的票，必须是本项目的。',
    },
    relatedId: {
      type: 'string',
      required: true,
      description: '被指向的那张票。',
    },
    kind: {
      type: 'string',
      enum: ['depends', 'relates'],
      required: true,
      description: 'depends 前置依赖：relatedId 没做完，ticketId 停在 queued。relates 只是相关，谁都不等谁。',
    },
  },
  output: {
    schema: { type: 'string', description: '关联结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const ticket = await db.ticket.requireOpen(args.ticketId, identity.projectId)
    const related = await db.ticket.findById(args.relatedId)
    if (!related || related.projectId !== identity.projectId)
      throw new Error('跨项目关联应由 Supervisor 处理')
    if (ticket.id === related.id)
      throw new Error('工单不能关联自己')
    await db.ticketLink.link(ticket.id, related.id, args.kind, new Date().toISOString())
    if (args.kind === 'depends' && !['done', 'completed', 'cancelled'].includes(related.status))
      await db.ticket.save(ticket.id, { status: 'queued', updatedAt: new Date().toISOString() })
    return JSON.stringify({ linked: true })
  },
})

export const stop_ticket = defineTool({
  name: 'stop_ticket',
  description: '按人的明确要求结单为 cancelled。必须绑一条 human=true 的触发 —— 停止是人的决定，不是编排的判断。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '要停的票。',
    },
    triggerId: {
      type: 'string',
      required: true,
      description: '人说停的那条触发。必须是 human=true，否则拒绝。',
    },
    reason: {
      type: 'string',
      description: '一句话说明为什么停，写进记录。',
    },
  },
  output: {
    schema: { type: 'string', description: '结单结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const ticket = await db.ticket.requireOpen(args.ticketId, identity.projectId)
    const trigger = await db.trigger.findById(args.triggerId)
    if (!trigger || trigger.human !== 1)
      throw new Error('停止工单必须绑定 human=true 的触发')
    if (!(await db.ticketThread.listByTicket(ticket.id)).some(row => row.threadId === trigger.threadId))
      throw new Error('停止触发不属于当前工单来源')
    for (const worker of await db.worker.listByTicket(ticket.id)) {
      if (worker.status === 'ended')
        continue
      if (worker.status === 'running')
        await session.cancel(worker.id)
      await db.worker.end(worker.id, 'stopped', new Date().toISOString())
    }
    const now = new Date().toISOString()
    await db.ticket.finish(ticket.id, 'cancelled', now, now)
    await workerService.archiveSessions(ticket.id)
    await db.inbox.returnPendingTicket(ticket.id, args.reason ?? '人类要求停止', now)
    for (const link of await db.supervisorTicket.listByTicket(ticket.id)) await db.inbox.enqueue({ type: 'supervisor', supervisorId: link.supervisorId, projectId: ticket.projectId, origin: 'project', kind: 'ticket', ticketId: ticket.id, title: 'dropped', message: args.reason ?? '人类要求停止' })
    return JSON.stringify({ id: ticket.id, status: 'cancelled' })
  },
})

export const retry_ticket = defineTool({
  name: 'retry_ticket',
  description: '重开卡住的票：结束旧 Worker，开一个新的。只对还开着、卡在 failed 的票有效。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '要重开的票。已到终态的票不适用 —— 那张只能由插件在人类消息到达时复活。',
    },
  },
  output: {
    schema: { type: 'string', description: '重开结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const ticket = await db.ticket.requireOpen(args.ticketId, identity.projectId)
    const workers = await db.worker.listByTicket(ticket.id)
    const old = workers.at(-1)
    if (!old || old.reportState !== 'failed')
      throw new Error('只允许重试 failed Worker')
    if (old.status === 'running')
      await session.cancel(old.id)
    await db.worker.end(old.id, 'restarted', new Date().toISOString())
    const worker = await db.worker.queue(ticket.id, identity.projectId, old.branch ?? undefined)
    if (old.branch && old.worktree)
      await db.worker.update(worker.id, { branch: old.branch, worktree: old.worktree })
    await workerService.reconcile()
    return JSON.stringify(await db.worker.findById(worker.id))
  },
})
