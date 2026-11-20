import { defineTool } from '@deepseek-ai/dsh-tools'
import { db } from '@/database'
import { session } from '@/service/session'

export const supervisor_list = defineTool({
  name: 'supervisor_list',
  description: '看 Supervisor：本项目相关的给明细，其余只给数量。',
  parameters: {
    status: {
      type: 'string',
      enum: ['active', 'closed'],
      description: '只看在协调中的或已收工的；省略表示只看 active。',
    },
  },
  output: {
    schema: { type: 'string', description: '本项目那一张展开全部字段；其他 Supervisor 只给条数。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Supermesh 身份')
    if (identity.role !== 'project' || !identity.projectId)
      throw new Error('仅项目编排可调用')
    const rows = await db.supervisor.listByStatus(args.status ?? 'active')
    const result = []
    let others = 0
    for (const row of rows) {
      const tickets = await Promise.all((await db.supervisorTicket.listBySupervisor(row.id)).map(link => db.ticket.findById(link.ticketId)))
      if (tickets.some(ticket => ticket?.projectId === identity.projectId))
        result.push({ ...row, tickets })
      else others++
    }
    return JSON.stringify({ supervisors: result, others })
  },
})
