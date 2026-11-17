import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const inbox_list = defineTool({
  name: 'inbox_list',
  description: '列出自己收件箱里 status=pending 的消息，按 createdAt 升序。',
  parameters: {
    detail: {
      type: 'boolean',
      description: 'true 时返回每条消息的正文；默认只给 id、kind 和一句话摘要。',
    },
  },
  output: {
    schema: { type: 'string', description: '收件箱消息列表，每条一行。' },
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
    const rows = await db.inbox.listScoped(scope)
    return JSON.stringify(rows.map(row => args.detail ? row : { id: row.id, kind: row.kind, summary: row.title ?? row.message.split('\n')[0].slice(0, 120) }))
  },
})

export const inbox_kill = defineTool({
  name: 'inbox_kill',
  description: '把收件箱消息标为 done。不需要先读，可以批量。',
  parameters: {
    ids: {
      type: 'array',
      items: { type: 'string' },
      required: true,
      description: '要标为 done 的收件箱 id 列表。',
    },
  },
  output: {
    schema: { type: 'string', description: '实际标为 done 的条数。' },
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
    return String(await db.inbox.completeScoped(args.ids, scope, new Date().toISOString()))
  },
})
