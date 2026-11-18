import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const ask_user = defineTool({
  name: 'ask_user',
  description: '问人。只有主编排能问 —— 它是唯一能触达人类的一层。',
  parameters: {
    question: {
      type: 'string',
      required: true,
      description: '要人回答的问题。写成人类听得懂的一句话，不要带技术黑话。',
    },
    triggerId: {
      type: 'string',
      description: '问题发到哪个渠道；给了就锚在这条触发上，省略则只留在面板里。',
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
    if (identity.role !== 'main')
      throw new Error('仅主编排可调用')
    const trigger = args.triggerId ? await db.trigger.findById(args.triggerId) : null
    if (args.triggerId && !trigger)
      throw new Error('触发不存在')
    const thread = trigger ? await db.thread.findById(trigger.threadId) : null
    if (trigger && (!thread || thread.kind === 'ci' || !thread.url))
      throw new Error('该触发没有可回复地址')
    const pending = (await db.inbox.listPendingAsk()).find(row => row.origin === 'main' && row.message === args.question && row.triggerId === (args.triggerId ?? null))
    if (pending)
      return JSON.stringify({ id: pending.id, status: 'pending', delivery: pending.triggerId ? 'queued' : 'panel' })
    const row = await db.inbox.enqueueAsk({ type: 'user', origin: 'main', kind: 'ask', triggerId: trigger?.id ?? null, threadId: thread?.id ?? null, projectId: thread?.projectId ?? null, message: args.question })
    return JSON.stringify({ id: row.id, status: 'pending', delivery: row.triggerId ? 'queued' : 'panel' })
  },
})
