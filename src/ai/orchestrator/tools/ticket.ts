import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const create_ticket = defineTool({
  name: 'create_ticket',
  description: '开一张票。任务一旦存在，projectId 就必须确定。',
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
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    return JSON.stringify(await db.ticket.createWithThreads(args.projectId, args.title, args.threadIds, args.description))
  },
})

export const list_ticket = defineTool({
  name: 'list_ticket',
  description: '列全部任务，可跨项目筛选。判重、找某张票的现状都靠它。',
  parameters: {
    status: {
      type: 'string',
      enum: ['waiting', 'queued', 'running', 'review', 'done', 'cancelled'],
      description: '只看某个状态；省略表示不含已终态的票。',
    },
    projectId: {
      type: 'string',
      description: '只看某个项目的票。省略表示所有项目。',
    },
    attentionOnly: {
      type: 'boolean',
      description: 'true 时只返回存在指向它的 pending ask 的票 —— 也就是需要人介入的那些。',
    },
  },
  output: {
    schema: { type: 'string', description: '任务列表，每张票一行：id、项目、标题、状态、PR 状态、有无 pending ask。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    return JSON.stringify(await db.ticket.listFiltered(args))
  },
})
