import { createHash } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { github } from '../../../channel/github/channel'
import { gitlab } from '../../../channel/gitlab/channel'
import { db } from '../../../database'
import { session } from '../../../service/session'

/**
 * 渠道观测策略：回复前必须先读过那条话题。
 *
 * 照官方 `dsh-fs-observation-policy` 的结构：按 owner（这里是会话对象，弱引用，
 * 会话回收时状态自动释放）持有每个话题的观测记录；写入前校验，未见即拒绝并给出错误码。
 * 目的是让 Agent 先看清渠道现状再决定要不要说话，避免重复发言。
 */
interface Observation {
  /** 读到的最后一条消息 id，用作「读的是哪一版」的依据。 */
  version: string
}

const observed = new WeakMap<object, Map<string, Observation>>()

function owner(exec: { agent?: { session?: object } }): object | undefined {
  return exec.agent?.session
}

function observe(exec: { agent?: { session?: object } }, threadId: string, version: string): void {
  const holder = owner(exec)
  if (!holder)
    return
  let byTarget = observed.get(holder)
  if (!byTarget) {
    byTarget = new Map()
    observed.set(holder, byTarget)
  }
  byTarget.set(threadId, { version })
}

/** 与官方 `requirePresent` 同义：没读过就抛出带错误码的拒绝。 */
function requireObserved(exec: { agent?: { session?: object } }, threadId: string, verb: string): Observation {
  const holder = owner(exec)
  const prior = holder ? observed.get(holder)?.get(threadId) : undefined
  if (!prior) {
    const error = new Error(`${verb} 需要先读过这个话题：调用 read_channel，resource 用 thread/<id> 或 trigger/<triggerId>`)
    error.name = 'ChannelNotObserved'
    throw error
  }
  return prior
}

/** 话题的最新消息 id，用于判定「读的是哪一版」。 */
async function latestVersion(threadId: string): Promise<string> {
  const triggers = await db.trigger.listRecent(1000)
  const latest = triggers.filter(item => item.threadId === threadId).sort((a, b) => b.at.localeCompare(a.at))[0]
  return latest?.id ?? 'empty'
}

/** 记下「这个会话读过这个话题」，并把读到的那一版留下来。 */
async function markThread(exec: { agent?: { session?: object } }, threadId: string): Promise<void> {
  observe(exec, threadId, await latestVersion(threadId))
}

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
      throw new Error('当前会话没有 Supermesh 身份')
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
      await markThread(exec, trigger.threadId)
      items = [trigger]
    }
    else if (resource.startsWith('thread/')) {
      const thread = await db.thread.findById(resource.slice(7))
      if (!thread)
        throw new Error('话题不存在')
      if (identity.role === 'worker' && !allowedThreads.has(thread.id))
        throw new Error('Worker 只能读取本任务来源')
      await markThread(exec, thread.id)
      items = [thread]
      nextResource = thread.kind !== 'ci' ? thread.url : null
    }
    else if (await isThreadId(resource)) {
      const thread = (await db.thread.findById(resource))!
      if (identity.role === 'worker' && !allowedThreads.has(thread.id))
        throw new Error('Worker 只能读取本任务来源')
      await markThread(exec, thread.id)
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
      for (const link of threads) await markThread(exec, link.threadId)
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
      // 读的是渠道原文，同样算作「已看过这个话题」。
      try {
        const matched = await db.thread.findByRef(isGitLab ? 'gitlab' : 'github', resource.replace(/^https?:\/\/[^/]+\//, '').replace(/\/pull\//, ':').replace(/\/issues\//, ':'))
        if (matched)
          await markThread(exec, matched.id)
      }
      catch {}
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
      throw new Error('当前会话没有 Supermesh 身份')
    const trigger = await db.trigger.findById(args.triggerId)
    if (!trigger)
      throw new Error('触发不存在')
    const thread = await db.thread.findById(trigger.threadId)
    if (!thread || thread.kind === 'ci' || !thread.url)
      throw new Error('该触发没有可回复地址')
    // 先读后写（照官方 observe/requirePresent）：没读过这个话题就不许回复。
    requireObserved(exec, thread.id, 'reply')
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
    // 一条话题上同一次事件只由一个人发声。
    // 「读过没有」只能证明它看过上下文，挡不住三个角色各自看过后各说一遍 ——
    // 真正的判据是这条话题上已经有谁就同一个 trigger 说过话。
    const said = await db.inbox.listByThread(thread.id)
    if (said.some(message => message.triggerId === trigger.id && message.origin !== identity.role))
      return JSON.stringify({ status: 'suppressed', reason: 'another_role_already_replied' })
    const ticketId = identity.ticketId ?? null
    const row = await db.inbox.enqueue({ id: replyKey(trigger.id, args.text), type: 'user', origin: identity.role, kind: 'notice', projectId: identity.projectId ?? thread.projectId, supervisorId: identity.supervisorId ?? null, workerId: identity.workerId ?? null, triggerId: trigger.id, threadId: thread.id, ticketId, message: args.text })
    return JSON.stringify({ id: row.id, status: 'queued' })
  },
})

/** 同一条触发 + 同一正文只入队一次，与官方 `key('reply', triggerId, text)` 同义。 */
function replyKey(triggerId: string, body: string): string {
  return `reply:${createHash('sha256').update(JSON.stringify([triggerId, body])).digest('hex').slice(0, 32)}`
}

async function isThreadId(value: string): Promise<boolean> {
  if (!/^[\w-]+:[\w./-]+$/.test(value))
    return false
  return Boolean(await db.thread.findById(value))
}

function canonicalGitHub(value: string): string {
  const match = /^github:([^:]+):(issue|pull):([1-9]\d*)$/.exec(value)
  if (match)
    return `https://github.com/${match[1]}/${match[2] === 'issue' ? 'issues' : 'pull'}/${match[3]}`
  const url = new URL(value)
  return url.origin + url.pathname.replace(/\/$/, '')
}
