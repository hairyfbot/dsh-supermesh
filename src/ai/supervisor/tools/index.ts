import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const list_ticket = defineTool({
  name: 'list_ticket',
  description: '列自己关联的工单及其进度。每次醒来先看它 —— 不要只信收件箱里那一条转述。',
  parameters: {},
  output: {
    schema: { type: 'string', description: '关联工单：id、项目、状态、prState、有无 pending ask。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'supervisor' || !identity.supervisorId)
      throw new Error('仅 Supervisor 可调用')
    const links = await db.supervisorTicket.listBySupervisor(identity.supervisorId)
    return JSON.stringify(await Promise.all(links.map(async (link) => {
      const ticket = await db.ticket.findById(link.ticketId)
      if (!ticket)
        throw new Error('关联工单不存在')
      return { ...ticket, attention: (await db.inbox.listByTicket(ticket.id)).some(row => row.kind === 'ask' && row.status === 'pending') }
    })))
  },
})

export const create_ticket = defineTool({
  name: 'create_ticket',
  description: '在某个项目下开一张票。工单会自动挂到你这个 supervisor 下，受你协调。',
  parameters: {
    title: {
      type: 'string',
      required: true,
      description: '一句话说清要做什么，用发起方的语言。不要加需求、验收标准或实现建议。',
    },
    projectId: {
      type: 'string',
      required: true,
      description: '这张票归哪个项目。',
    },
    threadIds: {
      type: 'array',
      items: { type: 'string' },
      required: true,
      description: '触发这张票的话题，至少一条。最早那条是「触发来源」。',
    },
    description: {
      type: 'string',
      description: '需求正文，没有就省略。',
    },
  },
  output: {
    schema: { type: 'string', description: '新票的 id 和状态。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'supervisor' || !identity.supervisorId)
      throw new Error('仅 Supervisor 可调用')
    if (!args.threadIds.length)
      throw new Error('建票至少要有一条来源话题')
    for (const threadId of args.threadIds) {
      if (!(await db.thread.findById(threadId)))
        throw new Error('来源话题不存在')
    }
    // 话题归属的是分诊关系，不是 Git 身份：一条话题可以同时被两个项目的票跟着。
    // 上游仓库没有自己的 issue 时，跨项目协调正是靠「拿已有话题去建别的项目的票」。
    const project = await db.project.findById(args.projectId)
    if (!project)
      throw new Error('项目不存在')
    if (!project.enabled)
      throw new Error('项目未启用')
    const ticket = await db.ticket.createWithThreads(args.projectId, args.title, args.threadIds, args.description)
    await db.supervisorTicket.link(identity.supervisorId, ticket.id, new Date().toISOString())
    return JSON.stringify({ id: ticket.id, status: ticket.status })
  },
})

export const link_dependency_ticket = defineTool({
  name: 'link_dependency_ticket',
  description: '记一条跨项目前置依赖。方向是「后来的指向先要做的」。别只记在脑子里 —— 你随时可能被重启。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '要等的那张票。',
    },
    dependsOn: {
      type: 'string',
      required: true,
      description: '必须先做完的那张票。',
    },
  },
  output: {
    schema: { type: 'string', description: '依赖记录结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'supervisor' || !identity.supervisorId)
      throw new Error('仅 Supervisor 可调用')
    const tickets = await Promise.all([args.ticketId, args.dependsOn].map(id => db.ticket.findById(id)))
    if (tickets.some(ticket => !ticket))
      throw new Error('工单不存在')
    await requireScope(identity.supervisorId, tickets.map(ticket => ticket!.projectId))
    await db.ticket.requireOpen(args.ticketId)
    if (args.ticketId === args.dependsOn)
      throw new Error('工单不能依赖自己')
    await db.ticketLink.link(args.ticketId, args.dependsOn, 'depends', new Date().toISOString())
    return JSON.stringify({ linked: true })
  },
})

export const link_ticket = defineTool({
  name: 'link_ticket',
  description: '记一条相关性关联：两张票有关，但谁都不等谁。限你协调范围内的项目之间。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '发起关联的票。',
    },
    relatedId: {
      type: 'string',
      required: true,
      description: '被指向的那张票。',
    },
  },
  output: {
    schema: { type: 'string', description: '关联结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'supervisor' || !identity.supervisorId)
      throw new Error('仅 Supervisor 可调用')
    if (args.ticketId === args.relatedId)
      throw new Error('工单不能关联自己')
    const tickets = await Promise.all([args.ticketId, args.relatedId].map(id => db.ticket.findById(id)))
    if (tickets.some(ticket => !ticket))
      throw new Error('工单不存在')
    await requireScope(identity.supervisorId, tickets.map(ticket => ticket!.projectId))
    await db.ticketLink.link(args.ticketId, args.relatedId, 'relates', new Date().toISOString())
    return JSON.stringify({ linked: true, kind: 'relates' })
  },
})

/** 票所属项目必须落在这个 supervisor 的协调范围内（即它已关联票涉及的项目）。 */
async function requireScope(supervisorId: string, projectIds: string[]): Promise<void> {
  const links = await db.supervisorTicket.listBySupervisor(supervisorId)
  const tickets = await Promise.all(links.map(link => db.ticket.findById(link.ticketId)))
  const scope = new Set(tickets.filter(Boolean).map(ticket => ticket!.projectId))
  for (const projectId of projectIds) {
    if (!scope.has(projectId))
      throw new Error('该项目还不在你的协调范围内：先用 create_ticket 在那个项目建票，票会自动挂到名下并带上它的项目')
  }
}

export const report = defineTool({
  name: 'report',
  description: '报给主编排，不等答复。',
  parameters: {
    state: {
      type: 'string',
      enum: ['progress', 'ready', 'failed', 'dropped'],
      required: true,
      description: 'progress 在跑 / ready 做完了 / failed 失败了 / dropped 不用做了。',
    },
    summary: {
      type: 'string',
      required: true,
      description: '一句话摘要。',
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
    if (identity.role !== 'supervisor' || !identity.supervisorId)
      throw new Error('仅 Supervisor 可调用')
    return JSON.stringify(await db.inbox.enqueue({ type: 'main', supervisorId: identity.supervisorId, origin: 'supervisor', kind: 'notice', title: args.state, message: args.summary }))
  },
})

export const ask = defineTool({
  name: 'ask',
  description: '问主编排，这条线停下等答复。要加人、加项目、或需要上级拍板时用它。',
  parameters: {
    question: {
      type: 'string',
      required: true,
      description: '要主编排回答的问题，一句话说清。',
    },
  },
  output: {
    schema: { type: 'string', description: 'ask 的 id。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'supervisor' || !identity.supervisorId)
      throw new Error('仅 Supervisor 可调用')
    return JSON.stringify(await db.inbox.enqueueAsk({ type: 'main', supervisorId: identity.supervisorId, origin: 'supervisor', kind: 'ask', message: args.question }))
  },
})
