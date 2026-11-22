import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '@/database'
import { session } from '@/service/session'
import { worker as workerService } from '@/service/worker'

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
      required: true,
      description: '分支名称（英文）将会自动拼接为 dsh/[分支名称]',
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
    const worker = await db.worker.queue(args.ticketId, identity.projectId, `dsh/${args.branch}`)
    await db.ticket.setPrepareError(args.ticketId, null, new Date().toISOString())
    await workerService.reconcile()
    return JSON.stringify(await db.worker.findById(worker.id))
  },
})

export const send = defineTool({
  name: 'send',
  description: '直接将完整消息交给活跃 Worker，跳过业务排队；只有需要立刻止损才用 interrupt。Worker 没有收件箱。票已结束不拦，Worker 还活着就能收到。',
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
      description: 'queue 在 Worker 运行中 steer 到最近一步，空闲时开新回合；interrupt 中止当前回合再 steer；reply 回答它的 ask，投递规则同 queue。',
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
    if (!(await session.lookup(worker.id)))
      throw new Error('Worker 未在运行时加载、已归档或不属于 Supermesh；不能直接发送')
    let messageId: string
    if (args.mode === 'reply') {
      const asks = (await db.inbox.listByTicket(ticket.id)).filter(row => row.workerId === worker.id && row.kind === 'ask' && row.status === 'pending')
      if (asks.length !== 1 || !db.inbox.owns(asks[0]!, { type: 'project', projectId: identity.projectId }))
        throw new Error('reply 必须唯一对应当前项目编排待答的 ask')
      await db.inbox.answerScoped(asks[0]!.id, args.text, { type: 'project', projectId: identity.projectId }, new Date().toISOString())
      messageId = await session.send(worker.id, `[Answer ${asks[0]!.id}] ${args.text}`, 'reply', `supermesh:answer:${asks[0]!.id}`)
    }
    else {
      messageId = await session.send(worker.id, args.text, args.mode === 'interrupt' ? 'interrupt' : 'wake')
    }
    return JSON.stringify({ messageId })
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
  description: '中断 Worker 当前回合：那一次回合作废，会话不结束，之后还能用 send 继续。票已结束也能停，只看 Worker 是否还活着。',
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
    schema: { type: 'string', description: '是否已受理。' },
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
    return JSON.stringify({ accepted: true })
  },
})

export const list_worker = defineTool({
  name: 'list_worker',
  description: '列出本项目还没结束的 Worker 和当前回合状态。running 表示正在跑；inactive 表示没有回合在跑，可以 send 继续。',
  parameters: {},
  output: {
    schema: { type: 'string', description: 'Worker 列表：id、票号、标题、状态。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (_args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (identity?.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const rows = []
    for (const ticket of await db.ticket.listByProject(identity.projectId)) {
      if (ticket.status === 'done' || ticket.status === 'cancelled')
        continue
      for (const worker of await db.worker.listByTicket(ticket.id)) {
        if (worker.status === 'ended')
          continue
        const agent = await session.lookup(worker.id)
        rows.push({ id: worker.id, ticketId: ticket.id, title: ticket.title, status: agent?.status === 'running' ? 'running' : 'inactive' })
      }
    }
    return JSON.stringify(rows)
  },
})
