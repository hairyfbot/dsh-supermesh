import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Selectable } from 'kysely'
import type { DB } from '../database/types'
import { db } from '../database'
import { defineService } from '../utils/service'
import { session } from './session'
import { setting } from './setting'

type Message = Selectable<DB['inbox']>
const operations = new Map<string, Promise<void>>()
const deliveredAnswers = new Set<string>()
let stopped = false
let observing = false

export const inbox = defineService({
  start(): () => Promise<void> {
    if (operations.size)
      throw new Error('inbox_busy')
    stopped = false
    observing = true
    deliveredAnswers.clear()
    return async () => {
      stopped = true
      observing = false
      await Promise.allSettled([...operations.values()])
      deliveredAnswers.clear()
    }
  },
  deliver(): Promise<void> {
    return run('delivery', async () => {
      const settings = await setting.load()
      const blocked = new Set<string>()
      const receipts = new Map<string, Awaited<ReturnType<typeof session.receipts>>>()
      for (const message of await db.inbox.listDelivery()) {
        if (stopped)
          break
        const key = [message.type, message.projectId, message.supervisorId, message.ticketId].join(':')
        if (blocked.has(key) || message.readAt)
          continue
        blocked.add(key)
        if (message.status === 'stalled' || (message.nextRetryAt && message.nextRetryAt > new Date().toISOString()))
          continue
        if (message.ticketId && (await db.ticket.findById(message.ticketId))?.paused)
          continue
        if (message.type === 'project' && message.projectId && !(await db.project.findById(message.projectId))?.enabled)
          continue
        try {
          const id = await recipient(message)
          if (!id)
            throw new Error('recipient_session_unavailable')
          let consumed = receipts.get(id)
          if (!consumed) {
            consumed = await session.receipts(id)
            receipts.set(id, consumed)
          }
          const requestId = `nexus:inbox:${message.id}:${message.escalations}`
          const receipt = consumed.find(item => item.requestId === requestId)
          if (receipt) {
            await db.inbox.markRead([message.id], receipt.consumedAt)
            blocked.delete(key)
            continue
          }
          if ((await session.activity(id)).running || stopped)
            continue
          await session.send(id, [message.title ?? '', `[Inbox ${message.id}] ${message.message}`].filter(Boolean).join(String.fromCharCode(10)), 'queue', requestId)
          await db.inbox.resetDelivery(message.id)
          blocked.delete(key)
        }
        catch (error) {
          if (stopped)
            break
          const reason = error instanceof Error ? error.message : String(error)
          const attempts = message.deliveryAttempts + 1
          const delay = Math.min(2 ** Math.min(attempts, 20), settings.deliveryRetryCeilingSeconds) * 1000
          await db.inbox.recordDeliveryFailure(message.id, reason, new Date(Date.now() + delay).toISOString())
          if (attempts >= settings.deliveryMaxAttempts)
            await db.inbox.markStalled(message.id, reason)
        }
      }
    })
  },
  deliverAnswers(): Promise<void> {
    return run('answers', async () => {
      for (const message of await db.inbox.listAnswered()) {
        if (stopped)
          break
        if (!message.answer || (message.nextRetryAt && message.nextRetryAt > new Date().toISOString()))
          continue
        try {
          let id: string | null = null
          if (message.origin === 'worker') {
            const worker = message.workerId ? await db.worker.findById(message.workerId) : undefined
            if (worker?.status === 'running')
              id = worker.id
          }
          else if (message.origin === 'project' && message.projectId) {
            const project = await db.project.findById(message.projectId)
            if (project?.enabled)
              id = project.orchestratorSessionId
          }
          else if (message.origin === 'supervisor' && message.supervisorId) {
            const supervisor = await db.supervisor.findById(message.supervisorId)
            if (supervisor?.status === 'active')
              id = supervisor.sessionId
          }
          else if (message.origin === 'main') {
            id = await session.findMain()
          }
          if (!id || deliveredAnswers.has(`${message.id}:${id}`) || stopped)
            continue
          if (message.ticketId && (await db.ticket.findById(message.ticketId))?.paused)
            continue
          await session.send(id, `[Answer ${message.id}] ${message.answer}`, 'reply', `nexus:answer:${message.id}`)
          deliveredAnswers.add(`${message.id}:${id}`)
          await db.inbox.resetDelivery(message.id)
        }
        catch (error) {
          if (stopped)
            break
          await db.inbox.recordDeliveryFailure(message.id, error instanceof Error ? error.message : String(error), new Date(Date.now() + 2000).toISOString())
        }
      }
    })
  },
  observe(source: Session, event: SessionEvent): Promise<void> {
    if (!observing || stopped || event.type !== 'turn/end' || event.data.reason.kind !== 'completed')
      return Promise.resolve()
    return run(`observe:${source.id}:${event.seq}`, async () => {
      const identity = await session.resolve(source.id)
      if (!identity || identity.role === 'worker')
        return
      const receipts = await session.receipts(source.id)
      for (const message of await db.inbox.listDelivery()) {
        if (stopped)
          break
        if (message.readAt || message.status !== 'pending' || message.type !== identity.role)
          continue
        if (identity.role === 'project' && message.projectId !== identity.projectId)
          continue
        if (identity.role === 'supervisor' && message.supervisorId !== identity.supervisorId)
          continue
        const receipt = receipts.find(item => item.requestId === `nexus:inbox:${message.id}:${message.escalations}`)
        if (receipt)
          await db.inbox.markRead([message.id], receipt.consumedAt)
      }
    })
  },
})

function run(key: string, action: () => Promise<void>): Promise<void> {
  if (stopped)
    return Promise.reject(new Error('inbox_stopped'))
  const current = operations.get(key)
  if (current)
    return current
  const task = Promise.resolve().then(action).finally(() => operations.delete(key))
  operations.set(key, task)
  return task
}

async function recipient(message: Message): Promise<string | null> {
  if (message.type === 'main')
    return session.findMain()
  if (message.type === 'project' && message.projectId) {
    const project = await db.project.findById(message.projectId)
    if (!project)
      throw new Error('project_not_found')
    return project.orchestratorSessionId ?? session.create('project', { projectId: project.id, directory: project.directory, title: project.name })
  }
  if (message.type === 'supervisor' && message.supervisorId) {
    const supervisor = await db.supervisor.findById(message.supervisorId)
    if (!supervisor || supervisor.status !== 'active')
      throw new Error('supervisor_not_active')
    return supervisor.sessionId ?? session.create('supervisor', { supervisorId: supervisor.id, title: supervisor.title })
  }
  throw new Error('invalid_inbox_recipient')
}
