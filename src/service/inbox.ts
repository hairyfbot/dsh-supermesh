import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Selectable } from 'kysely'
import type { InboxScope } from '../database/models/inbox'
import type { DB } from '../database/types'
import type {} from '../types/mailbox'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { db } from '../database'
import { defineService } from '../utils/service'
import { session } from './session'
import { setting } from './setting'

type Message = Selectable<DB['inbox']>
const operations = new Map<string, Promise<void>>()
const deliveredAnswers = new Set<string>()
let stopped = false

export const inbox = defineService({
  async notify(agent: Agent, restore = false): Promise<void> {
    return run(`notify:${agent.session.id}`, async () => {
      if (agent.status !== 'idle' && !restore)
        return
      const mailbox = await inbox.peek(agent.session.id)
      if (!mailbox)
        return
      const revision = mailbox.messages.map(message => [message.id, message.escalations]).sort().map(parts => parts.join(':')).join('|')
      if (!revision && !restore)
        return
      const { events } = await session.history(agent.session.id)
      if ([...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => message.source.kind === (restore ? 'nexus-mailbox-context' : 'nexus-mailbox') && message.source.revision === revision))
        return
      if (events.some(event => event.type === 'user/message' && event.data.source.kind === (restore ? 'nexus-mailbox-context' : 'nexus-mailbox') && event.data.source.revision === revision))
        return
      const text = `你有${mailbox.pendingCount}个未读邮件，请及时处理。`
      const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: restore ? 'nexus-mailbox-context' : 'nexus-mailbox', form: 'notice', summary: text, revision } })
      if (stopped || !(await session.resolve(agent.session.id)))
        return
      if (restore)
        agent.inject(message)
      else if (agent.status === 'idle')
        agent.followup(message)
    })
  },
  async peek(id: string, includeChannel = false) {
    const identity = await session.resolve(id)
    if (!identity)
      return null
    const scope = scopeOf(identity)
    if (!scope)
      return null
    const messages = await db.inbox.listScoped(scope, includeChannel)
    return { sessionId: id, role: scope.type, pendingCount: messages.length, messages }
  },
  async read(id: string, includeChannel = false) {
    const mailbox = await inbox.peek(id, includeChannel)
    if (!mailbox)
      throw new Error('unknown_session')
    const now = new Date().toISOString()
    await db.inbox.markRead(mailbox.messages.filter(message => !message.readAt).map(message => message.id), now)
    return mailbox
  },
  async complete(id: string, ids: string[], includeChannel = false): Promise<number> {
    const identity = await session.resolve(id)
    if (!identity)
      throw new Error('unknown_session')
    const scope = scopeOf(identity)
    if (!scope)
      throw new Error('unknown_session')
    return db.inbox.completeScoped(ids, scope, new Date().toISOString(), includeChannel)
  },
  start(): () => Promise<void> {
    if (operations.size)
      throw new Error('inbox_busy')
    stopped = false
    deliveredAnswers.clear()
    return async () => {
      stopped = true
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
        if (message.origin !== 'channel') {
          if (!blocked.has(key)) {
            blocked.add(key)
            const id = await recipient(message, false)
            const agent = id ? await session.lookup(id) : null
            if (agent?.status === 'idle')
              await inbox.notify(agent)
          }
          continue
        }
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
          if (message.answeredBy !== 'user' && message.origin !== 'worker') {
            await db.inbox.enqueueAnswer(message)
            continue
          }
          let id: string | null = null
          if (message.origin === 'worker') {
            const worker = message.workerId ? await db.worker.findById(message.workerId) : undefined
            if (!worker)
              throw new Error('worker_not_found')
            if (worker.status === 'ended')
              throw new Error('worker_ended')
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

async function recipient(message: Message, create = true): Promise<string | null> {
  if (message.type === 'main')
    return session.findMain()
  if (message.type === 'project' && message.projectId) {
    const project = await db.project.findById(message.projectId)
    if (!project)
      throw new Error('project_not_found')
    return project.orchestratorSessionId ?? (create ? session.create('project', { projectId: project.id, directory: project.directory, title: project.name }) : null)
  }
  if (message.type === 'supervisor' && message.supervisorId) {
    const supervisor = await db.supervisor.findById(message.supervisorId)
    if (!supervisor || supervisor.status !== 'active')
      throw new Error('supervisor_not_active')
    return supervisor.sessionId ?? (create ? session.create('supervisor', { supervisorId: supervisor.id, title: supervisor.title }) : null)
  }
  throw new Error('invalid_inbox_recipient')
}

function scopeOf(identity: NonNullable<Awaited<ReturnType<typeof session.resolve>>>): InboxScope | null {
  if (identity.role === 'main')
    return { type: 'main' }
  if (identity.role === 'project' && identity.projectId)
    return { type: 'project', projectId: identity.projectId }
  if (identity.role === 'supervisor' && identity.supervisorId)
    return { type: 'supervisor', supervisorId: identity.supervisorId }
  return null
}
