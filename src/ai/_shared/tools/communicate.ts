import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const answer = defineTool({
  name: 'answer',
  description: '回答下面升上来的 ask：填 answer，标 status=done，答案送回发起方。',
  parameters: {
    askId: {
      type: 'string',
      required: true,
      description: '要回答的那条 ask 的 Inbox id。',
    },
    text: {
      type: 'string',
      required: true,
      description: '答案正文。发起方会原样收到。',
    },
  },
  output: {
    schema: { type: 'string', description: '是否已回送。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role === 'worker')
      throw new Error('Worker 没有收件箱')
    const scope = identity.role === 'project' && identity.projectId ? { type: 'project' as const, projectId: identity.projectId } : identity.role === 'supervisor' && identity.supervisorId ? { type: 'supervisor' as const, supervisorId: identity.supervisorId } : identity.role === 'main' ? { type: 'main' as const } : null
    if (!scope)
      throw new Error('会话身份不完整')
    const question = await db.inbox.findById(args.askId)
    if (question?.origin === 'worker') {
      if (!question.workerId || !(await session.lookup(question.workerId)))
        throw new Error('Worker 未在运行时加载、已归档或不属于 Supermesh；不能直接回答')
      if ((await db.worker.findById(question.workerId))?.status === 'ended')
        throw new Error('Worker 已结束')
    }
    const row = await db.inbox.answerScoped(args.askId, args.text, scope, new Date().toISOString())
    if (row.origin === 'worker' && row.workerId)
      await session.send(row.workerId, `[Answer ${row.id}] ${args.text}`, 'reply', `supermesh:answer:${row.id}`)
    return JSON.stringify({ id: args.askId, status: 'done', delivery: row.origin === 'worker' ? 'direct' : 'queued' })
  },
})
