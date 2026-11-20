import { defineTool } from '@deepseek-ai/dsh-tools'
import { inbox } from '@/service/inbox'

export const inbox_list = defineTool({
  name: 'inbox_list',
  description: '读取当前角色未处理邮件和原渠道任务，包含 pending 和 stalled。读取标为已读但不会完成。',
  parameters: { detail: { type: 'boolean', description: 'true 返回完整上下文；默认返回摘要。' } },
  output: { schema: { type: 'string', description: '当前角色未处理邮件。' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async (args, exec) => {
    const mailbox = await inbox.read(exec.agent?.session.id ?? '', true)
    return JSON.stringify(args.detail ? mailbox.messages : mailbox.messages.map(row => ({ id: row.id, kind: row.kind, summary: row.title ?? row.message.split('\n')[0].slice(0, 120) })))
  },
})

export const read_mailbox = defineTool({
  name: 'read_mailbox',
  description: '读取当前角色未处理邮件，以及可用项目的 id、仓库地址和本地路径。可传 ids 一次读取指定多条邮件。渠道邮件带 trigger 事实（actor / human / mentioned）：mentioned=no 只是时间线记录，不是开工请求。读取标为已读，处理完用 inbox_kill，ask 必须用 answer。',
  parameters: {
    ids: {
      type: 'array',
      items: { type: 'string' },
      description: '只读取这些邮件 id；省略则读取全部未处理邮件。',
    },
  },
  output: { schema: { type: 'string', description: '完整角色邮箱，或所选邮件。' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async (args, exec) => JSON.stringify(await inbox.read(exec.agent?.session.id ?? '', true, args.ids)),
})

export const inbox_kill = defineTool({
  name: 'inbox_kill',
  description: '将自己角色的邮件显式标为 done；未回答的 ask 不能跳过。',
  parameters: { ids: { type: 'array', items: { type: 'string' }, required: true, description: '已处理邮件的 id。' } },
  output: { schema: { type: 'string', description: '完成数量。' }, render: (_args, value) => [{ type: 'text', text: value }] },
  execute: async (args, exec) => String(await inbox.complete(exec.agent?.session.id ?? '', args.ids, true)),
})
