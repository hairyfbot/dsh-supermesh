import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '@/database'
import { session } from '@/service/session'

export const answer = defineTool({
  name: 'answer',
  description: '回答下面升上来的 ask：填 answer，标 status=done，答案由投递队列送回发起方。Worker 这一轮已结束也会被重新拉起；会话已归档才改投项目编排。',
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
    schema: { type: 'string', description: '答案 id、状态与投递去向。' },
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
    // 答案先落库，投递交给 inbox.deliverAnswers 统一处理：Worker 这一轮结束了就把它重新
    // 拉起来，会话已归档才改投项目编排。这里直接拒绝或直接 send 都会让答案凭空消失。
    await db.inbox.answerScoped(args.askId, args.text, scope, new Date().toISOString())
    return JSON.stringify({ id: args.askId, status: 'done', delivery: 'queued' })
  },
})
