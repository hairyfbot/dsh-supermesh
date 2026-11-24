import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'
import { randomUUID } from 'node:crypto'
import { joinAssistantStreamText } from '@deepseek-ai/dsh-llm'
import { getServerContext } from 'dsh-h3/utils'
import { db } from '@/database'
import { singlet } from '@/runtime/singlet'
import { server } from '@/server'
import { archive } from '@/service/archive'
import { inbox } from '@/service/inbox'
import { session } from '@/service/session'
import { setting } from '@/service/setting'
import { worktree } from '@/service/worktree'
import { worktreeBranch } from '@/utils/branch'
import { defineService } from '@/utils/service'

const eventQueues = new Map<string, Promise<void>>()
let stopped = false
let observing = false

/** 票进终态后归档它名下所有已结束的 Worker 会话：已归档跳过，单个失败只告警，不阻断结单。 */
const archiveEndedWorkers = singlet(
  (ticketId: string) => `worker:archive:${ticketId}`,
  async (ticketId: string): Promise<void> => {
    for (const current of await db.worker.listByTicket(ticketId)) {
      if (current.status !== 'ended' || !current.startedAt)
        continue
      await archive.session(current.id).catch((error: unknown) => {
        getServerContext<Context>(server).logger.warn('supermesh: archiving worker %s failed: %s', current.id, error instanceof Error ? error.message : String(error))
      })
    }
  },
)

const finish = singlet(
  (current: Selectable<DB['worker']>) => `worker:finish:${current.id}`,
  async (current: Selectable<DB['worker']>, reason?: 'failed' | 'stopped'): Promise<void> => {
    // 观察事件与后台回收可能同时到达：已经结束的 Worker 不再重复结单、重复通知。
    const worker = await db.worker.findById(current.id)
    if (!worker || worker.status === 'ended')
      return
    const asks = (await db.inbox.listByTicket(worker.ticketId)).filter(message => message.kind === 'ask' && message.workerId === worker.id)
    if (!reason) {
      if (asks.some(message => message.status === 'pending')) {
        await deferWhileWaiting(worker)
        return
      }
      const answered = asks.filter(message => message.answer)
      if (answered.length) {
        const receipts = await session.receipts(worker.id)
        if (answered.some(message => !receipts.some(receipt => receipt.requestId === `supermesh:answer:${message.id}`))) {
          await deferWhileWaiting(worker)
          return
        }
      }
    }
    if (stopped)
      return
    const now = new Date().toISOString()
    await db.worker.setBackgroundUntil(worker.id, null)
    await db.worker.end(worker.id, reason ?? (worker.reportState === 'failed' ? 'failed' : 'completed'), now)
    const ticket = await db.ticket.findById(worker.ticketId)
    if (ticket && ticket.status !== 'done' && ticket.status !== 'cancelled') {
      if (ticket.prState === 'merged' || ticket.prState === 'closed')
        await finishTicket(ticket.id, 'done', now, now)
      else if (!reason && worker.reportState === 'dropped')
        await finishTicket(ticket.id, 'done', now, now)
      else
        await db.ticket.update(ticket.id, { status: !reason && worker.reportState === 'ready' ? 'review' : 'waiting', updatedAt: now })
    }
    const ended = await db.ticket.findById(worker.ticketId)
    // 只有票真正终结才归档会话。票还在 review / waiting 时，后续的 review 意见要复用这个 worker，
    // 会话一旦归档，resolve 就返回 null，下一轮会直接以 unknown_session 失败。
    if (ended && (ended.status === 'done' || ended.status === 'cancelled')) {
      await archiveEndedWorkers(ended.id)
      await releaseDependents(ended.id)
    }
    await notifyRouter(worker, reason)
  },
)

export const worker = defineService({
  start(): () => Promise<void> {
    if (singlet.busy('worker:slots') || eventQueues.size)
      throw new Error('worker_busy')
    stopped = false
    observing = true
    return async () => {
      stopped = true
      observing = false
      while (singlet.keys().some(key => key.startsWith('worker:')) || eventQueues.size)
        await Promise.allSettled([singlet.drain(), ...[...eventQueues.values()]])
    }
  },
  reconcile: singlet('worker:slots', async () => {
    const settings = await setting.load()
    for (const worker of await db.worker.listRunning()) {
      if (stopped)
        break
      const ticket = await db.ticket.findById(worker.ticketId)
      if (!ticket) {
        await db.worker.end(worker.id, 'stopped', new Date().toISOString())
        continue
      }
      // 票进终态就是授权收回：必须结束它的 running Worker，否则它会一直占着槽位继续推代码。
      if (ticket.status === 'done' || ticket.status === 'cancelled') {
        // 冷会话没有可打断的回合：为它 resume 一个 Agent 只会留下一条永远等不到下一步的 steer。
        if (await session.lookup(worker.id))
          await session.send(worker.id, `票 ${ticket.id} 已${ticket.status === 'done' ? '完成' : '取消'}，本次授权已收回：立即停手，不要再提交、推送或开 PR。`, 'interrupt').catch(() => undefined)
        await db.worker.end(worker.id, 'stopped', new Date().toISOString())
        await archiveEndedWorkers(ticket.id)
        continue
      }
      if (ticket.prState === 'merged' || ticket.prState === 'closed') {
        const now = new Date().toISOString()
        await db.worker.end(worker.id, 'stopped', now)
        await finishTicket(ticket.id, 'done', now, now)
        await releaseDependents(ticket.id)
        continue
      }
      const activity = await session.activity(worker.id).catch(() => null)
      if (activity && (activity.running || activity.background || activity.queued))
        continue
      // 本轮刚启动时，会话里可能还只有上一轮的事件，最后活动时间远早于 startedAt。
      // 只按会话历史判活会让新一轮在若干毫秒内被判死，所以 startedAt 也给一段宽限。
      const started = worker.startedAt ? Date.parse(worker.startedAt) : Number.NaN
      if (Number.isFinite(started) && Date.now() - started < 120_000)
        continue
      const last = await session.lastActivity(worker.id)
      if (last && Date.now() - last < 120_000)
        continue
      const now = new Date().toISOString()
      await db.worker.end(worker.id, worker.reportState === 'ready' ? 'completed' : 'stopped', now)
      await db.ticket.update(ticket.id, { status: worker.reportState === 'ready' ? 'review' : 'waiting', updatedAt: now })
    }
    for (const waiting of await db.ticket.listFiltered({ status: 'waiting' })) {
      if (stopped)
        break
      if (waiting.paused || waiting.prepareError)
        continue
      if (await blockedByDependency(waiting.id))
        continue
      const links = await db.ticketLink.listDependsOn(waiting.id)
      if (!links.length)
        continue
      if ((await db.worker.listByTicket(waiting.id)).some(worker => worker.status !== 'ended'))
        continue
      await db.ticket.update(waiting.id, { status: 'queued', updatedAt: new Date().toISOString() })
      await db.worker.queue(waiting.id, waiting.projectId).catch(() => undefined)
    }
    let running = (await db.worker.listRunning()).length
    // flow.md：`running --> waiting : Worker 结束需重开`。`waiting` 没有依赖时同样要能被派工，
    // 否则一旦编排把票置回 waiting，它就再也不会被拾起（MR 开着也不会继续改）。
    // 按 id 去重：`listQueued()` 与下面新排队的 worker 会重叠，同一个 worker 派两次会重复投递 prompt。
    const queueable = new Map<string, Selectable<DB['worker']>>()
    for (const worker of await db.worker.listQueued())
      queueable.set(worker.id, worker)
    for (const waiting of await db.ticket.listFiltered({ status: 'waiting' })) {
      if (waiting.paused || waiting.prepareError)
        continue
      if (waiting.prState === 'merged' || waiting.prState === 'closed')
        continue
      // 被依赖的票没到终态时必须留在 waiting：这一步会直接把票改成 queued，
      // 不挡就会绕过 depends 约束，出现「前置还没做完，后继已经开工」。
      if (await blockedByDependency(waiting.id))
        continue
      if ((await db.worker.listByTicket(waiting.id)).some(worker => worker.status !== 'ended'))
        continue
      // 同 rescue：派过工的票不自动重开，避免 waiting/running 死循环。
      if ((await db.worker.listByTicket(waiting.id)).length)
        continue
      const queued = await db.worker.queue(waiting.id, waiting.projectId).catch(() => undefined)
      if (queued)
        queueable.set(queued.id, queued)
    }
    for (const worker of queueable.values()) {
      if (stopped || running >= settings.maxWorkers)
        break
      // 同一 tick 里前面的分支可能已经把它派出去，只派仍然在排队的。
      const current = await db.worker.findById(worker.id)
      if (!current || current.status !== 'queued')
        continue
      const ticket = await db.ticket.findById(worker.ticketId)
      if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled') {
        await db.worker.end(worker.id, 'stopped', new Date().toISOString())
        continue
      }
      if (ticket.prState === 'merged' || ticket.prState === 'closed') {
        const now = new Date().toISOString()
        await db.worker.end(worker.id, 'stopped', now)
        await finishTicket(ticket.id, 'done', now, now)
        await releaseDependents(ticket.id)
        continue
      }
      if (ticket.paused)
        continue
      if (await blockedByDependency(ticket.id))
        continue
      if ((await db.inbox.listByTicket(ticket.id)).some(message => message.kind === 'ask' && message.status === 'pending' && message.workerId === worker.id))
        continue
      const project = await db.project.findById(ticket.projectId)
      if (!project) {
        await db.ticket.setPrepareError(ticket.id, 'project_not_found', new Date().toISOString())
        continue
      }
      if (!project.enabled)
        continue
      let started = false
      try {
        let directory = worker.worktree
        // 复用判据必须与 activate 一致：归档后的会话仍有 history，但 resolve 返回 null，
        // 复用它只会在激活时 unknown_session，票就永远卡在 queued。
        const existing = await session.resolve(worker.id).then(Boolean).catch(() => false)
        if (existing) {
          if (directory && worker.branch)
            await worktree.verify(project.directory, directory, worker.branch)
          directory = directory ?? project.directory
          // 复用同一 worker 时上一轮会话已 end-seed；prompt 的契约是「先显式恢复会话再投递」，
          // 不在这里恢复，后面的 send 只会进空气，Worker 永远收不到这一轮的 prompt。
          await session.activate(worker.id)
        }
        else {
          await session.create('worker', { sessionId: worker.id, ticketId: ticket.id, projectId: project.id, directory: project.directory })
          if (stopped)
            throw new Error('worker_stopped')
          if (directory && worker.branch) {
            await worktree.verify(project.directory, directory, worker.branch)
          }
          else {
            const created = await worktree.create(await session.activate(worker.id), worker.branch ?? worktreeBranch(ticket.title, ticket.id))
            directory = created.worktree
            await db.worker.update(worker.id, { branch: created.branch, worktree: directory })
          }
        }
        if (!directory)
          throw new Error('worker_directory_required')
        if (stopped)
          throw new Error('worker_stopped')
        const threads = await db.ticketThread.listByTicket(ticket.id)
        const sources = await Promise.all(threads.map(async (thread) => {
          const latest = await db.trigger.findLatestByThread(thread.threadId)
          return latest ? `${thread.threadId}（trigger ${latest.id}）` : thread.threadId
        }))
        const prompt = [`${ticket.id}: ${ticket.title}`, ticket.description ?? '', `执行配置：${JSON.stringify({ autoMerge: settings.autoMerge, autoMergeMaxLines: settings.autoMergeMaxLines })}`, '来源话题：', ...sources, worker.recoveryNote ?? '', '你的最后一条消息会原样转给项目编排。'].filter(Boolean).join(String.fromCharCode(10))
        const now = new Date().toISOString()
        await db.worker.start(worker.id, now)
        await db.ticket.start(ticket.id, now, now)
        running++
        started = true
        // requestId 必须每次派工唯一：会话控制器按 rpcId 去重（hasPromptRequest），
        // 固定 id 会让重派工被静默吞掉，worker 置 running 却收不到任何 prompt。
        await session.send(worker.id, prompt, 'queue', `supermesh:worker:${worker.id}:${randomUUID()}`)
        await db.ticket.setPrepareError(ticket.id, null, now)
      }
      catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        // 会话相关的失败（已归档 / id 被占）只有换新 worker 记录才能恢复：
        // 老 id 的会话归档后既激活不了、也建不了同 id，继续复用只会一直失败。
        if (reason === 'unknown_session' || reason === 'session_identity_conflict') {
          await db.worker.end(worker.id, 'stopped', new Date().toISOString())
          await db.worker.queue(ticket.id, ticket.projectId, worker.branch ?? undefined, true).catch(() => undefined)
          await db.ticket.setPrepareError(ticket.id, null, new Date().toISOString())
          if (stopped)
            break
          continue
        }
        await db.ticket.setPrepareError(ticket.id, reason, new Date().toISOString())
        if (stopped)
          break
        if (started) {
          await session.stop(worker.id)
          await db.worker.end(worker.id, 'failed', new Date().toISOString())
          const latest = await db.ticket.findById(ticket.id)
          if (latest && latest.prState === 'merged' && latest.status !== 'done')
            await finishTicket(latest.id, 'done', new Date().toISOString(), new Date().toISOString())
          else if (!latest || (latest.status !== 'done' && latest.status !== 'cancelled'))
            await db.ticket.update(ticket.id, { status: 'waiting', updatedAt: new Date().toISOString() })
          running--
        }
      }
    }
  }),

  reconcileBackground: singlet('worker:background', async () => {
    const now = new Date().toISOString()
    for (const worker of await db.worker.listRunning()) {
      if (stopped)
        break
      if (!worker.backgroundUntil)
        continue
      const activity = await session.activity(worker.id)
      const expired = worker.backgroundUntil <= now
      if (!expired && (activity.running || activity.background || activity.queued))
        continue
      if (expired)
        await session.stop(worker.id)
      await finish(worker, expired ? 'stopped' : undefined)
    }
  }),
  archiveSessions: archiveEndedWorkers,
  cancel: singlet(
    (ticketId: string) => `worker:cancel:${ticketId}`,
    async (ticketId: string): Promise<void> => {
      const now = new Date().toISOString()
      for (const current of await db.worker.listByTicket(ticketId)) {
        if (current.status === 'ended')
          continue
        await session.stop(current.id).catch(() => undefined)
        await db.worker.end(current.id, 'stopped', now)
      }
    },
  ),
  rescue: singlet('worker:rescue', async () => {
    for (const ticket of await db.ticket.listOpen()) {
      if (stopped)
        break
      if (ticket.status !== 'waiting')
        continue
      if ((await db.worker.listByTicket(ticket.id)).some(worker => worker.status !== 'ended'))
        continue
      // 派过工的票不自动重开：worker 结束后回 waiting 是等新事实（评论、retry_ticket、编排 send），
      // 拿同一份 prompt 反复重派只会让票在 waiting/running 之间无限循环。
      if ((await db.worker.listByTicket(ticket.id)).length)
        continue
      const project = await db.project.findById(ticket.projectId)
      if (!project?.enabled)
        continue
      if (ticket.prState === 'merged' || ticket.prState === 'closed') {
        const now = new Date().toISOString()
        await finishTicket(ticket.id, 'done', now, now)
        await releaseDependents(ticket.id)
        continue
      }
      if (ticket.paused)
        continue
      if (ticket.prepareError)
        await db.ticket.setPrepareError(ticket.id, null, new Date().toISOString())
      await db.worker.queue(ticket.id, ticket.projectId)
    }
  }),
  recover: singlet('worker:recovery', async () => {
    for (const worker of await db.worker.listRunning()) {
      if (stopped)
        break
      const ticket = await db.ticket.findById(worker.ticketId)
      if (!ticket)
        continue
      if (ticket.status === 'done' || ticket.status === 'cancelled') {
        if (await session.lookup(worker.id))
          await session.stop(worker.id)
        await db.worker.end(worker.id, 'stopped', new Date().toISOString())
        continue
      }
      if (ticket.paused)
        continue
      try {
        const project = await db.project.findById(ticket.projectId)
        if (project && !project.enabled)
          continue
        if (ticket.prState === 'merged') {
          await db.worker.end(worker.id, 'stopped', new Date().toISOString())
          await finishTicket(ticket.id, 'done', new Date().toISOString(), new Date().toISOString())
          await releaseDependents(ticket.id)
          continue
        }
        if (!project) {
          await db.worker.requeue(worker.id)
          continue
        }
        if (worker.worktree && worker.branch)
          await worktree.verify(project.directory, worker.worktree, worker.branch)
        if (!(await session.resolve(worker.id))) {
          await db.worker.requeue(worker.id)
          continue
        }
        const activity = await session.activity(worker.id)
        if (activity.background && !worker.backgroundUntil) {
          const settings = await setting.load()
          await db.worker.setBackgroundUntil(worker.id, new Date(Date.now() + Math.min(30, settings.backgroundLimitMinutes) * 60000).toISOString())
        }
        if (activity.running || activity.background || activity.queued)
          continue
        const note = '运行已恢复。先检查目录、git 历史与渠道的当前事实，再决定是否重做外部动作；不要重复开 PR 或发布评论。'
        await db.worker.setRecoveryNote(worker.id, note)
        const asks = await db.inbox.listByTicket(ticket.id)
        if (!asks.some(message => message.kind === 'ask' && message.status === 'pending' && message.workerId === worker.id))
          await session.send(worker.id, note, 'queue', `supermesh:recovery:${randomUUID()}`)
      }
      catch (error) {
        if (stopped)
          break
        const now = new Date().toISOString()
        const latest = await db.ticket.findById(ticket.id)
        if (latest && (latest.status === 'done' || latest.status === 'cancelled' || latest.prState === 'merged')) {
          if (latest.prState === 'merged' && latest.status !== 'done')
            await finishTicket(latest.id, 'done', now, now)
          await db.worker.end(worker.id, 'stopped', now)
          continue
        }
        await db.ticket.setPrepareError(ticket.id, error instanceof Error ? error.message : String(error), now)
        await db.ticket.update(ticket.id, { status: 'waiting', updatedAt: now })
        await db.worker.end(worker.id, 'failed', now)
      }
    }
  }),
  observe: singlet(
    source => `worker:event:${source.id}`,
    async (source: Session, event: SessionEvent): Promise<void> => {
      if (!observing || stopped || event.type !== 'turn/end')
        return
      const previous = eventQueues.get(source.id) ?? Promise.resolve()
      const action = (): Promise<void> => stopped
        ? Promise.resolve()
        : (async () => {
            // cancel 只停当前回合：回合作废，Worker 会话留着，后续 send 还能继续。
            if (event.data.reason.kind === 'aborted' && event.data.reason.reason.kind === 'hook' && event.data.reason.reason.reason === 'supermesh_cancel')
              return
            const identity = await session.resolve(source.id)
            if (!identity || identity.role !== 'worker' || !identity.workerId)
              return
            const current = await db.worker.findById(identity.workerId)
            if (!current || current.status !== 'running')
              return
            const activity = await session.activity(current.id)
            if (activity.background) {
              const settings = await setting.load()
              if (!current.backgroundUntil)
                await db.worker.setBackgroundUntil(current.id, new Date(Date.now() + Math.min(30, settings.backgroundLimitMinutes) * 60000).toISOString())
              return
            }
            if (activity.queued)
              return
            await finish(current, event.data.reason.kind === 'error' ? 'failed' : event.data.reason.kind === 'aborted' ? 'stopped' : undefined)
          })()
      const current = previous.then(action, action).finally(() => {
        if (eventQueues.get(source.id) === current)
          eventQueues.delete(source.id)
      })
      eventQueues.set(source.id, current)
      return current
    },
  ),
})

async function blockedByDependency(ticketId: string): Promise<boolean> {
  const links = await db.ticketLink.listDependsOn(ticketId)
  if (!links.length)
    return false
  for (const link of links) {
    const related = await db.ticket.findById(link.relatedId)
    if (!related || related.status === 'done' || related.status === 'cancelled')
      continue
    return true
  }
  return false
}

/**
 * 票进终态时通知它所属的 supervisor。
 * 不要求两票之间有 depends —— 跨项目协调里 supervisor 往往靠「这张做完了」才能派下一张，
 * 漏掉这条通知，整条链路就停在原地，票却不报错。
 */
/** 结单并通知相关方：所有终态路径都必须经过这里，否则 supervisor 收不到「这张做完了」。 */
async function finishTicket(id: string, status: 'done' | 'cancelled', endedAt: string, updatedAt: string): Promise<void> {
  await db.ticket.finish(id, status, endedAt, updatedAt)
  await archiveEndedWorkers(id)
  await notifySupervisor(id)
}

async function notifySupervisor(ticketId: string): Promise<void> {
  const ticket = await db.ticket.findById(ticketId)
  if (!ticket || (ticket.status !== 'done' && ticket.status !== 'cancelled'))
    return
  for (const link of await db.supervisorTicket.listByTicket(ticketId)) {
    const supervisor = await db.supervisor.findById(link.supervisorId)
    if (!supervisor || supervisor.status !== 'active')
      continue
    await db.inbox.enqueue({
      id: `supervisor:${link.supervisorId}:ticket:${ticketId}:${ticket.status}`,
      type: 'supervisor',
      origin: 'system',
      kind: 'notice',
      supervisorId: link.supervisorId,
      message: `${ticketId} ${ticket.status === 'done' ? '已完成' : '已取消'}：${ticket.title}`,
      title: ticket.title,
    }).catch(() => undefined)
  }
}

async function releaseDependents(relatedId: string): Promise<void> {
  for (const link of await db.ticketLink.listDependents(relatedId)) {
    const ticket = await db.ticket.findById(link.ticketId)
    if (!ticket || ticket.status !== 'waiting' || ticket.paused)
      continue
    if (await blockedByDependency(ticket.id))
      continue
    if ((await db.worker.listByTicket(ticket.id)).some(worker => worker.status !== 'ended'))
      continue
    await db.ticket.update(ticket.id, { status: 'queued', updatedAt: new Date().toISOString() })
    await db.worker.queue(ticket.id, ticket.projectId).catch(() => undefined)
  }
}

async function deferWhileWaiting(current: Selectable<DB['worker']>): Promise<void> {
  const ticket = await db.ticket.findById(current.ticketId)
  if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled')
    return
  const now = new Date().toISOString()
  await db.worker.end(current.id, 'completed', now)
  if (ticket.prState === 'merged')
    await finishTicket(ticket.id, 'done', now, now)
  else
    await db.ticket.update(ticket.id, { status: 'waiting', updatedAt: now })
  await notifyRouter(current)
}

type SettlementStopReason = 'completed' | 'aborted' | 'error'

function settlementSummary(name: string, stopReason: SettlementStopReason): string {
  const subject = `Worker ${name}`
  if (stopReason === 'completed')
    return `${subject} finished. It cannot receive follow-up messages.`
  if (stopReason === 'aborted')
    return `${subject} was stopped before it finished.`
  return `${subject} failed before it finished.`
}

/** 官方结算只带子级最后一条非空 assistant 消息；没有正文时用流式拼接兜底。 */
async function closingText(id: string): Promise<string[]> {
  const { events } = await session.history(id)
  let message: string[] = []
  let streamed = ''
  for (const event of events) {
    if (event.type === 'assistant/message') {
      const content = event.data.message.content
      if (content.length > 0)
        message = content.flatMap(part => part.type === 'text' && part.text.length > 0 ? [part.text] : [])
      streamed += joinAssistantStreamText(event.data.stream)
    }
    else if (event.type === 'assistant/attempt') {
      streamed += joinAssistantStreamText(event.data.stream)
    }
  }
  return message.length ? message : streamed ? [streamed] : []
}

/**
 * Worker 是独立根会话，不在官方 subagent 树里，拿不到官方的结算通知。
 * 结算落成项目编排的一条邮件：会话里只留紧凑通知，收尾文本由 read_mailbox 取。
 */
async function notifyRouter(current: Selectable<DB['worker']>, reason?: 'failed' | 'stopped'): Promise<void> {
  try {
    const ticket = await db.ticket.findById(current.ticketId)
    if (!ticket)
      return
    const project = await db.project.findById(ticket.projectId)
    if (!project?.enabled)
      return
    const stopReason: SettlementStopReason = reason === 'failed' ? 'error' : reason === 'stopped' ? 'aborted' : 'completed'
    const summary = settlementSummary(ticket.id, stopReason)
    const closing = await closingText(current.id)
    // 同一个 worker 记录可以被重新排队再跑一轮：结算 id 带上这一次的结束时刻，两轮各留一条。
    const settledAt = (await db.worker.findById(current.id))?.endedAt ?? new Date().toISOString()
    await db.inbox.enqueue({
      id: `supermesh:settlement:${current.id}:${settledAt}`,
      type: 'project',
      projectId: project.id,
      origin: 'worker',
      kind: 'notice',
      ticketId: ticket.id,
      workerId: current.id,
      title: summary,
      message: [summary, ...closing.length === 0 ? ['It left no closing message.'] : ['Its closing message:', ...closing]].join(String.fromCharCode(10)),
    })
    const existing = project.orchestratorSessionId
    const id = existing && await session.resolve(existing).then(Boolean, () => false)
      ? existing
      : await session.create('project', { projectId: project.id })
    await inbox.notify(await session.activate(id))
  }
  catch (error) {
    getServerContext<Context>(server).logger.warn('supermesh: worker %s settlement notice failed: %s', current.id, error instanceof Error ? error.message : String(error))
  }
}
