import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const dispatch_ticket = defineTool({
  name: 'dispatch_ticket',
  description: '把票派给它的项目编排：写一条 Inbox(type=project, kind=ticket)。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '要派下去的票。归属由票自己决定，不用另外传项目。',
    },
    message: {
      type: 'string',
      description: '附带给该项目编排的话。派新票时可省；只是提醒或调整时，写清楚要它做什么 —— 只说场景和约束，不要附实现方案。',
    },
  },
  output: {
    schema: { type: 'string', description: '派工结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main' && identity.role !== 'supervisor')
      throw new Error('仅主编排或 Supervisor 可派票')
    const ticket = await db.ticket.requireOpen(args.ticketId)
    if (identity.role === 'supervisor' && !(await db.supervisorTicket.listBySupervisor(identity.supervisorId!)).some(row => row.ticketId === ticket.id))
      throw new Error('工单不属于当前 Supervisor')
    return JSON.stringify(await db.inbox.enqueue({ type: 'project', projectId: ticket.projectId, supervisorId: identity.supervisorId ?? null, origin: identity.role, kind: 'ticket', ticketId: ticket.id, message: args.message ?? ticket.title }))
  },
})

export const note_ticket = defineTool({
  name: 'note_ticket',
  description: '把在别处得到的事实告诉这张票的项目编排：只传信息，不给授权，不改任何状态。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '要通知的票。消息进它所属项目编排的收件箱。',
    },
    text: {
      type: 'string',
      required: true,
      description: '要说的事实，一句话，例如「A 把接口改成了 Y」。只说发生了什么，不要写成任务要求或实现建议。',
    },
  },
  output: {
    schema: { type: 'string', description: '投递结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main' && identity.role !== 'supervisor')
      throw new Error('仅主编排或 Supervisor 可通知项目')
    const ticket = await db.ticket.findById(args.ticketId)
    if (!ticket)
      throw new Error('工单不存在')
    if (identity.role === 'supervisor' && !(await db.supervisorTicket.listBySupervisor(identity.supervisorId!)).some(row => row.ticketId === ticket.id))
      throw new Error('工单不属于当前 Supervisor')
    return JSON.stringify(await db.inbox.enqueue({ type: 'project', projectId: ticket.projectId, supervisorId: identity.supervisorId ?? null, origin: identity.role, kind: 'notice', ticketId: ticket.id, message: args.text }))
  },
})
