import { createHash } from 'node:crypto'
import { db } from '@/database'

/**
 * 渠道观测策略：回复前必须先读过那条话题。
 *
 * 照官方 `dsh-fs-observation-policy` 的结构：按 owner（这里是会话对象，弱引用，
 * 会话回收时状态自动释放）持有每个话题的观测记录；写入前校验，未见即拒绝并给出错误码。
 * 目的是让 Agent 先看清渠道现状再决定要不要说话，避免重复发言。
 */
export interface Observation {
  /** 读到的最后一条消息 id，用作「读的是哪一版」的依据。 */
  version: string
}

export const observed = new WeakMap<object, Map<string, Observation>>()

export function owner(exec: { agent?: { session?: object } }): object | undefined {
  return exec.agent?.session
}

/** 同一条触发 + 同一正文只入队一次，与官方 `key('reply', triggerId, text)` 同义。 */
export function replyKey(triggerId: string, body: string): string {
  return `reply:${createHash('sha256').update(JSON.stringify([triggerId, body])).digest('hex').slice(0, 32)}`
}

export async function isThreadId(value: string): Promise<boolean> {
  if (!/^[\w-]+:[\w./-]+$/.test(value))
    return false
  return Boolean(await db.thread.findById(value))
}

export function observe(exec: { agent?: { session?: object } }, threadId: string, version: string): void {
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
export function requireObserved(exec: { agent?: { session?: object } }, threadId: string, verb: string): Observation {
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
export async function latestVersion(threadId: string): Promise<string> {
  const triggers = await db.trigger.listRecent(1000)
  const latest = triggers.filter(item => item.threadId === threadId).sort((a, b) => b.at.localeCompare(a.at))[0]
  return latest?.id ?? 'empty'
}

/** 记下「这个会话读过这个话题」，并把读到的那一版留下来。 */
export async function markThread(exec: { agent?: { session?: object } }, threadId: string): Promise<void> {
  observe(exec, threadId, await latestVersion(threadId))
}
