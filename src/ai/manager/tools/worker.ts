import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'
import { worker as workerService } from '../../../service/worker'

export const create_worker = defineTool({
  name: 'create_worker',
  description: '给一张票开 Worker：建 worktree、切分支、起会话一次配好。并发满了就让它留在 queued。',
  parameters: {
    ticketId: {
      type: 'string',
      required: true,
      description: '要开跑的票，必须是本项目的。',
    },
    branch: {
      type: 'string',
      description: '分支名，省略则用 nexus/<任务号>。末段必须是任务号，PR 归哪张票就靠这个字符串比对。',
    },
  },
  output: {
    schema: { type: 'string', description: '新 Worker 的 id、分支与 worktree 路径。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const worker = await db.worker.queue(args.ticketId, identity.projectId, args.branch)
    await workerService.reconcile()
    return JSON.stringify(await db.worker.findById(worker.id))
  },
})

export const send = defineTool({
  name: 'send',
  description: '直接将完整消息交给活跃 Worker，跳过业务排队；只有需要立刻止损才用 interrupt。Worker 没有收件箱。',
  parameters: {
    workerId: {
      type: 'string',
      required: true,
      description: '目标 Worker。',
    },
    text: {
      type: 'string',
      required: true,
      description: '要说的话。',
    },
    mode: {
      type: 'string',
      enum: ['queue', 'interrupt', 'reply'],
      required: true,
      description: 'queue 也直接 steer 到最近一步；interrupt 中止当前回合再 steer；reply 回答它的 ask 并直接 steer。',
    },
  },
  output: {
    schema: { type: 'string', description: '投递结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const worker = await db.worker.findById(args.workerId)
    if (!worker)
      throw new Error('Worker 不存在')
    const ticket = await db.ticket.findById(worker.ticketId)
    if (!ticket || ticket.projectId !== identity.projectId)
      throw new Error('Worker 不属于当前项目')
    if (worker.status === 'ended')
      throw new Error('Worker 已结束')
    if (ticket.status === 'done' || ticket.status === 'cancelled')
      throw new Error('工单已结束')
    if (!(await session.lookup(worker.id)))
      throw new Error('Worker 未在运行时加载、已归档或不属于 Nexus；不能直接发送')
    if (args.mode === 'reply') {
      const asks = (await db.inbox.listByTicket(ticket.id)).filter(row => row.workerId === worker.id && row.kind === 'ask' && row.status === 'pending')
      if (asks.length !== 1 || !db.inbox.owns(asks[0]!, { type: 'project', projectId: identity.projectId }))
        throw new Error('reply 必须唯一对应当前项目编排待答的 ask')
      await db.inbox.answerScoped(asks[0]!.id, args.text, { type: 'project', projectId: identity.projectId }, new Date().toISOString())
      await session.send(worker.id, `[Answer ${asks[0]!.id}] ${args.text}`, 'reply', `nexus:answer:${asks[0]!.id}`)
    }
    else {
      await session.send(worker.id, args.text, args.mode)
    }
    return JSON.stringify({ sent: true, mode: args.mode })
  },
})

export const view = defineTool({
  name: 'view',
  description: '读 Worker 会话正文，分片返回。这不是 report —— report 是结构化状态通道。',
  parameters: {
    workerId: {
      type: 'string',
      required: true,
      description: '要读的 Worker。',
    },
    offset: {
      type: 'integer',
      description: '从上次的 next_offset 续读；0 表示从头读。',
    },
  },
  output: {
    schema: { type: 'string', description: '会话正文分片，末尾附 next_offset。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const worker = await db.worker.findById(args.workerId)
    if (!worker || (await db.ticket.findById(worker.ticketId))?.projectId !== identity.projectId)
      throw new Error('Worker 不属于当前项目')
    if (args.offset !== undefined && (!Number.isInteger(args.offset) || args.offset < 0))
      throw new Error('offset 必须是非负整数')
    return JSON.stringify(await session.view(worker.id, args.offset))
  },
})

export const cancel = defineTool({
  name: 'cancel',
  description: '中止 Worker 当前回合。那一次回合一并作废。',
  parameters: {
    workerId: {
      type: 'string',
      required: true,
      description: '要中止的 Worker。',
    },
    keepInbox: {
      type: 'boolean',
      description: 'true 保留官方 Agent 尚未接收的输入；省略则清除。不涉及业务收件箱。',
    },
  },
  output: {
    schema: { type: 'string', description: '中止结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const worker = await db.worker.findById(args.workerId)
    if (!worker)
      throw new Error('Worker 不存在')
    const ticket = await db.ticket.findById(worker.ticketId)
    if (!ticket || ticket.projectId !== identity.projectId)
      throw new Error('Worker 不属于当前项目')
    if (worker.status === 'ended')
      throw new Error('Worker 已结束')
    await session.cancel(worker.id, args.keepInbox)
    return JSON.stringify({ cancelled: true })
  },
})

export const rename = defineTool({
  name: 'rename',
  description: '改 Worker 会话的标题，方便在会话列表里认出来。',
  parameters: {
    workerId: {
      type: 'string',
      required: true,
      description: '要改名的 Worker。',
    },
    title: {
      type: 'string',
      required: true,
      description: '新标题。',
    },
  },
  output: {
    schema: { type: 'string', description: '改名结果。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const worker = await db.worker.findById(args.workerId)
    if (!worker)
      throw new Error('Worker 不存在')
    const ticket = await db.ticket.findById(worker.ticketId)
    if (!ticket || ticket.projectId !== identity.projectId)
      throw new Error('Worker 不属于当前项目')
    if (worker.status === 'ended')
      throw new Error('Worker 已结束')
    await session.rename(worker.id, args.title)
    await db.worker.update(worker.id, { title: args.title })
    return JSON.stringify({ id: worker.id, title: args.title })
  },
})
