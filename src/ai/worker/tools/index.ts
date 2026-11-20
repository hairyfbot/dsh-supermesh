import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '@/database'
import { session } from '@/service/session'

export const report = defineTool({
  name: 'report',
  description: '报告进度。发完继续干活，不等回复。要对方动脑子的走 ask。',
  parameters: {
    state: {
      type: 'string',
      enum: ['progress', 'ready', 'failed', 'dropped'],
      required: true,
      description: 'progress 在跑 / ready 干完了（PR 已开）/ failed 失败了 / dropped 不用做了。「我在等答复」不占状态位。',
    },
    summary: {
      type: 'string',
      required: true,
      description: '一句话摘要，短。给机器和面板看，详细解释写正文。',
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
    if (identity.role !== 'worker' || !identity.workerId || !identity.ticketId)
      throw new Error('仅 Worker 可调用')
    const worker = await db.worker.findById(identity.workerId)
    if (!worker || worker.status === 'ended')
      throw new Error('Worker 已结束')
    return JSON.stringify(await db.worker.reportProgress(worker.id, args.state, args.summary))
  },
})

export const ask = defineTool({
  name: 'ask',
  description: '问项目编排。发完这条工作线停下，等答案被 prompt 回来。不要一边问一边继续做。',
  parameters: {
    question: {
      type: 'string',
      required: true,
      description: '要问的问题，一句话说清卡在哪。',
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
    if (identity.role !== 'worker' || !identity.workerId || !identity.ticketId)
      throw new Error('仅 Worker 可调用')
    const ticket = await db.ticket.requireOpen(identity.ticketId)
    const worker = await db.worker.findById(identity.workerId)
    if (!worker || worker.status === 'ended')
      throw new Error('Worker 已结束')
    return JSON.stringify(await db.inbox.enqueueAsk({ type: 'project', projectId: ticket.projectId, origin: 'worker', kind: 'ask', ticketId: ticket.id, workerId: worker.id, message: args.question }))
  },
})
