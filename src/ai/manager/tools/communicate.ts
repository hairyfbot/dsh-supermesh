import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const report = defineTool({
  name: 'report',
  description: '向上级报事实：状态 + 一句话摘要。发完继续，不等答复。',
  parameters: {
    state: {
      type: 'string',
      enum: ['progress', 'ready', 'failed', 'dropped'],
      required: true,
      description: 'progress 在跑 / ready 干完了 / failed 失败了 / dropped 不用做了。',
    },
    summary: {
      type: 'string',
      required: true,
      description: '一句话摘要。给机器和面板看，短。',
    },
    supervisorId: {
      type: 'string',
      description: '本票在某个 Supervisor 下且进入终态时必须带，否则那边一直等。不带则报给主编排。',
    },
    ticketId: {
      type: 'string',
      description: '只做溯源，写进 Inbox.ticketId，不参与路由。',
    },
  },
  output: {
    schema: { type: 'string', description: '是否已投递。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    if (args.ticketId) {
      const ticket = await db.ticket.findById(args.ticketId)
      if (!ticket || ticket.projectId !== identity.projectId)
        throw new Error('工单不属于当前项目')
    }
    if (args.supervisorId && !(await db.supervisor.findById(args.supervisorId)))
      throw new Error('Supervisor 不存在')
    return JSON.stringify(await db.inbox.enqueue({ type: args.supervisorId ? 'supervisor' : 'main', projectId: identity.projectId, supervisorId: args.supervisorId ?? null, origin: 'project', kind: 'ticket', ticketId: args.ticketId ?? null, title: args.state, message: args.summary }))
  },
})

export const ask = defineTool({
  name: 'ask',
  description: '向上级提问。发完这条工作线停下，答案到了会被 prompt 回来；会话本身继续处理别的票。',
  parameters: {
    question: {
      type: 'string',
      required: true,
      description: '要上级回答的问题，一句话说清。',
    },
    supervisorId: {
      type: 'string',
      description: '本票在某个 Supervisor 下时，问题直接进它，不再绕主编排。',
    },
    ticketId: {
      type: 'string',
      description: '只做溯源，写进 Inbox.ticketId，不参与路由。',
    },
  },
  output: {
    schema: { type: 'string', description: 'ask 的 id 与投递去向。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    if (args.ticketId)
      await db.ticket.requireOpen(args.ticketId, identity.projectId)
    if (args.supervisorId && (await db.supervisor.findById(args.supervisorId))?.status !== 'active')
      throw new Error('Supervisor 不存在或已关闭')
    return JSON.stringify(await db.inbox.enqueueAsk({ type: args.supervisorId ? 'supervisor' : 'main', projectId: identity.projectId, supervisorId: args.supervisorId ?? null, origin: 'project', kind: 'ask', ticketId: args.ticketId ?? null, message: args.question }))
  },
})

export const escalate = defineTool({
  name: 'escalate',
  description: '把一条已有的 ask 原样上交：问题文本不改，就地改 type 换处理者。',
  parameters: {
    askId: {
      type: 'string',
      required: true,
      description: '要上交的那条 ask 的 Inbox id。',
    },
  },
  output: {
    schema: { type: 'string', description: '上交后的处理者。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    return JSON.stringify(await db.inbox.escalateScoped(args.askId, { type: 'project', projectId: identity.projectId }, new Date().toISOString()))
  },
})
