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
      throw new Error('当前会话没有 Nexus 身份')
    if (identity.role === 'worker')
      throw new Error('Worker 没有收件箱')
    const scope = identity.role === 'project' && identity.projectId ? { type: 'project' as const, projectId: identity.projectId } : identity.role === 'supervisor' && identity.supervisorId ? { type: 'supervisor' as const, supervisorId: identity.supervisorId } : identity.role === 'main' ? { type: 'main' as const } : null
    if (!scope)
      throw new Error('会话身份不完整')
    await db.inbox.answerScoped(args.askId, args.text, scope, new Date().toISOString())
    return JSON.stringify({ id: args.askId, status: 'done', delivery: 'queued' })
  },
})
