import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Selectable } from 'kysely'
import type { DB } from '../database/types'
import { randomUUID } from 'node:crypto'
import { db } from '../database'
import { defineService } from '../utils/service'
import { session } from './session'
import { setting } from './setting'
import { worktree } from './worktree'

const operations = new Map<string, Promise<void>>()
const eventQueues = new Map<string, Promise<void>>()
let stopped = false
let observing = false

export const worker = defineService({
  start(): () => Promise<void> {
    if (operations.size || eventQueues.size)
      throw new Error('worker_busy')
    stopped = false
    observing = true
    return async () => {
      stopped = true
      observing = false
      while (operations.size || eventQueues.size)
        await Promise.allSettled([...operations.values(), ...eventQueues.values()])
    }
  },
  reconcile(): Promise<void> {
    return run('slots', async () => {
      const settings = await setting.load()
      let running = (await db.worker.listRunning()).length
      for (const worker of await db.worker.listQueued()) {
        if (stopped || running >= settings.maxWorkers)
          break
        const ticket = await db.ticket.findById(worker.ticketId)
        if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled') {
          await db.worker.end(worker.id, 'stopped', new Date().toISOString())
          continue
        }
        if (ticket.paused || ticket.prepareError)
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
          let branch = worker.branch
          let directory = worker.worktree
          if (branch && directory) {
            await worktree.verify(project.directory, directory, branch)
          }
          else {
            const created = await worktree.create(project.directory, ticket.id, branch ?? undefined)
            branch = created.branch
            directory = created.worktree
            await db.worker.update(worker.id, { branch, worktree: directory })
          }
          if (stopped)
            throw new Error('worker_stopped')
          const threads = await db.ticketThread.listByTicket(ticket.id)
          const prompt = [`${ticket.id}: ${ticket.title}`, ticket.description ?? '', `执行配置：${JSON.stringify({ autoMerge: settings.autoMerge, autoMergeMaxLines: settings.autoMergeMaxLines })}`, '来源话题：', ...threads.map(thread => thread.threadId), worker.recoveryNote ?? ''].filter(Boolean).join(String.fromCharCode(10))
          await session.create('worker', { sessionId: worker.id, ticketId: ticket.id, projectId: project.id, directory, title: worker.title ?? ticket.title })
          if (stopped)
            throw new Error('worker_stopped')
          const now = new Date().toISOString()
          await db.worker.start(worker.id, now)
          await db.ticket.start(ticket.id, now, now)
          running++
          started = true
          await session.send(worker.id, prompt, 'queue', `nexus:worker:${worker.id}`)
          await db.ticket.setPrepareError(ticket.id, null, now)
        }
        catch (error) {
          await db.ticket.setPrepareError(ticket.id, error instanceof Error ? error.message : String(error), new Date().toISOString())
          if (stopped)
            break
          if (started) {
            await session.stop(worker.id)
            await db.worker.end(worker.id, 'failed', new Date().toISOString())
            await db.ticket.update(ticket.id, { status: 'waiting', updatedAt: new Date().toISOString() })
            running--
          }
        }
      }
    })
  },

  reconcileBackground(): Promise<void> {
    return run('background', async () => {
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
    })
  },
  recover(): Promise<void> {
    return run('recovery', async () => {
      for (const worker of await db.worker.listRunning()) {
        if (stopped)
          break
        const ticket = await db.ticket.findById(worker.ticketId)
        if (!ticket)
          continue
        if (ticket.status === 'done' || ticket.status === 'cancelled') {
          if (await session.resolve(worker.id))
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
          if (!project || !worker.worktree || !worker.branch)
            throw new Error('worker_workspace_missing')
          await worktree.verify(project.directory, worker.worktree, worker.branch)
          if (!(await session.resolve(worker.id)))
            throw new Error('worker_session_unavailable')
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
            await session.send(worker.id, note, 'queue', `nexus:recovery:${randomUUID()}`)
        }
        catch (error) {
          if (stopped)
            break
          const now = new Date().toISOString()
          await db.ticket.setPrepareError(ticket.id, error instanceof Error ? error.message : String(error), now)
          await db.ticket.update(ticket.id, { status: 'waiting', updatedAt: now })
          await db.worker.end(worker.id, 'failed', now)
        }
      }
    })
  },
  observe(source: Session, event: SessionEvent): Promise<void> {
    if (!observing || stopped || event.type !== 'turn/end')
      return Promise.resolve()
    const previous = eventQueues.get(source.id) ?? Promise.resolve()
    const action = (): Promise<void> => stopped
      ? Promise.resolve()
      : run(`event:${source.id}:${event.seq}`, async () => {
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
        })
    const current = previous.then(action, action).finally(() => {
      if (eventQueues.get(source.id) === current)
        eventQueues.delete(source.id)
    })
    eventQueues.set(source.id, current)
    return current
  },
})

function run(key: string, action: () => Promise<void>): Promise<void> {
  if (stopped)
    return Promise.reject(new Error('worker_stopped'))
  const current = operations.get(key)
  if (current)
    return current
  const task = Promise.resolve().then(action).finally(() => operations.delete(key))
  operations.set(key, task)
  return task
}

async function finish(current: Selectable<DB['worker']>, reason?: 'failed' | 'stopped'): Promise<void> {
  const asks = (await db.inbox.listByTicket(current.ticketId)).filter(message => message.kind === 'ask' && message.workerId === current.id)
  if (!reason) {
    if (asks.some(message => message.status === 'pending'))
      return
    const answered = asks.filter(message => message.answer)
    if (answered.length) {
      const receipts = await session.receipts(current.id)
      if (answered.some(message => !receipts.some(receipt => receipt.requestId === `nexus:answer:${message.id}`)))
        return
    }
  }
  if (stopped)
    return
  const now = new Date().toISOString()
  await db.worker.setBackgroundUntil(current.id, null)
  await db.worker.end(current.id, reason ?? (current.reportState === 'failed' ? 'failed' : 'completed'), now)
  const ticket = await db.ticket.findById(current.ticketId)
  if (ticket && ticket.status !== 'done' && ticket.status !== 'cancelled')
    await db.ticket.update(ticket.id, { status: !reason && current.reportState === 'ready' ? 'review' : 'waiting', updatedAt: now })
}
