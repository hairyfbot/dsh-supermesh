import { defineTool } from '@deepseek-ai/dsh-tools'
import { github } from '../../../channel/github/channel'
import { gitlab } from '../../../channel/gitlab/channel'
import { db } from '../../../database'
import { session } from '../../../service/session'

export const read_channel = defineTool({
  name: 'read_channel',
  description: '读渠道原文，靠 resource 路径前缀分发。返回 { items, next_offset, next_resource }，两条翻页轴都要跟完。',
  parameters: {
    resource: {
      type: 'string',
      required: true,
      description: '资源路径，前缀决定分发：github/…、gitlab/…、gitlab:<项目>:issue|pull:<编号>、渠道原文 URL、trigger/<id>、thread/<id>、ticket/<id>。',
    },
    offset: {
      type: 'integer',
      description: '从上一次的 next_offset 续读；0 表示重读同一份快照的开头。',
    },
    limit: {
      type: 'integer',
      description: '本次最多返回多少条；省略则用渠道默认值。',
    },
  },
  output: {
    schema: { type: 'string', description: '本条资源的正文分片，末尾附 next_offset / next_resource。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Nexus 身份')
    const offset = args.offset ?? 0
    const limit = args.limit ?? 50
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('offset 必须非负，limit 必须在 1–100')
    const resource = args.resource.startsWith('github/') ? `https://github.com/${args.resource.slice(7)}` : args.resource
    const links = identity.role === 'worker' && identity.ticketId ? await db.ticketThread.listByTicket(identity.ticketId) : []
    const allowedThreads = new Set(links.map(link => link.threadId))
    let items: unknown[]
    let nextResource: string | null = null
    if (resource.startsWith('trigger/')) {
      const trigger = await db.trigger.findById(resource.slice(8))
      if (!trigger)
        throw new Error('触发不存在')
      if (identity.role === 'worker' && !allowedThreads.has(trigger.threadId))
        throw new Error('Worker 只能读取本任务来源')
      items = [trigger]
    }
    else if (resource.startsWith('thread/')) {
      const thread = await db.thread.findById(resource.slice(7))
      if (!thread)
        throw new Error('话题不存在')
      if (identity.role === 'worker' && !allowedThreads.has(thread.id))
        throw new Error('Worker 只能读取本任务来源')
      items = [thread]
      nextResource = thread.kind !== 'ci' ? thread.url : null
    }
    else if (resource.startsWith('ticket/')) {
      const ticket = await db.ticket.findById(resource.slice(7))
      if (!ticket)
        throw new Error('工单不存在')
      if (identity.role === 'worker' && ticket.id !== identity.ticketId)
        throw new Error('Worker 只能读取本任务来源')
      const threads = await db.ticketThread.listByTicket(ticket.id)
      items = [ticket, ...threads.map(link => ({ resource: `thread/${link.threadId}` }))]
    }
    else {
      const isGitHub = resource.startsWith('github:') || (() => {
        try {
          const url = new URL(resource)
          return url.origin === 'https://github.com' && !url.username && !url.password
        }
        catch { return false }
      })()
      const isGitLab = !isGitHub && await gitlab.canRead(resource)
      if (!isGitHub && !isGitLab)
        throw new Error('不支持的渠道资源')
      const target = isGitLab ? await gitlab.canonicalResource(resource) : resource
      if (identity.role === 'worker') {
        const threads = await Promise.all(links.map(link => db.thread.findById(link.threadId)))
        let allowed = false
        for (const thread of threads) {
          if (!thread?.url || thread.channelId !== (isGitLab ? 'gitlab' : 'github') || (identity.projectId && thread.projectId && thread.projectId !== identity.projectId))
            continue
          if (isGitLab) {
            if (await gitlab.canRead(thread.url) && await gitlab.canonicalResource(thread.url) === target)
              allowed = true
          }
          else if (canonicalGitHub(thread.url) === canonicalGitHub(resource)) {
            allowed = true
          }
        }
        if (!allowed)
          throw new Error('Worker 只能读取本任务来源')
      }
      return JSON.stringify(isGitLab ? await gitlab.read(target, offset, limit) : await github.read(resource, offset, limit))
    }
    const page = items.slice(offset, offset + limit)
    return JSON.stringify({ items: page, next_offset: offset + page.length < items.length ? offset + page.length : null, next_resource: nextResource })
  },
})

export const reply_channel = defineTool({
  name: 'reply_channel',
  description: '按触发在对应渠道发言。锚点是 triggerId，不用猜发到哪。排队成功不等于送达。',
  parameters: {
    triggerId: {
      type: 'string',
      required: true,
      description: '要回复的那条触发 id；回复发到这条触发所在的渠道地址。',
    },
    text: {
      type: 'string',
      required: true,
      description: '发言正文，像人话。渠道的上限由对应 skill 说明。',
    },
  },
  output: {
    schema: { type: 'string', description: '入队结果，例如 queued 或具体状态。' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  execute: async (args, exec) => {
    const identity = await session.resolve(exec.agent?.session.id ?? '')
    if (!identity)
      throw new Error('当前会话没有 Nexus 身份')
    const trigger = await db.trigger.findById(args.triggerId)
    if (!trigger)
      throw new Error('触发不存在')
    const thread = await db.thread.findById(trigger.threadId)
    if (!thread || thread.kind === 'ci' || !thread.url)
      throw new Error('该触发没有可回复地址')
    if (identity.role === 'worker') {
      if (!identity.ticketId || !(await db.ticketThread.listByTicket(identity.ticketId)).some(row => row.threadId === thread.id))
        throw new Error('Worker 只能回复本任务来源')
      await db.ticket.requireOpen(identity.ticketId)
    }
    if (identity.role === 'project' && thread.projectId !== identity.projectId) {
      const tickets = await Promise.all((await db.ticketThread.listByThread(thread.id)).map(link => db.ticket.findById(link.ticketId)))
      if (!tickets.some(ticket => ticket?.projectId === identity.projectId))
        throw new Error('触发不属于当前项目')
    }
    const ticketId = identity.ticketId ?? null
    const row = await db.inbox.enqueue({ type: 'user', origin: identity.role, kind: 'notice', projectId: identity.projectId ?? thread.projectId, supervisorId: identity.supervisorId ?? null, workerId: identity.workerId ?? null, triggerId: trigger.id, threadId: thread.id, ticketId, message: args.text })
    return JSON.stringify({ id: row.id, status: 'queued' })
  },
})

function canonicalGitHub(value: string): string {
  const match = /^github:([^:]+):(issue|pull):([1-9]\d*)$/.exec(value)
  if (match)
    return `https://github.com/${match[1]}/${match[2] === 'issue' ? 'issues' : 'pull'}/${match[3]}`
  const url = new URL(value)
  return url.origin + url.pathname.replace(/\/$/, '')
}
