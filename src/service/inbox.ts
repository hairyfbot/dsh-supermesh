import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Selectable } from 'kysely'
import type { InboxScope } from '@/database/models/inbox'
import type { DB, ThreadKind, ThreadTriage } from '@/database/types'
import type { TriggerStrength } from '@/types/admission'
import type {} from '@/types/mailbox'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { db } from '@/database'
import { singlet } from '@/runtime/singlet'
import { triggerStrength } from '@/service/admission'
import { session } from '@/service/session'
import { setting } from '@/service/setting'
import { repositoryOf } from '@/utils/repository'
import { defineService } from '@/utils/service'

type Message = Selectable<DB['inbox']>
let stopped = false

export const inbox = defineService({
  notify: singlet(
    agent => `inbox:notify:${agent.session.id}`,
    async (agent: Agent): Promise<void> => {
      if (agent.status !== 'idle')
        return
      const mailbox = await inbox.peek(agent.session.id)
      if (!mailbox)
        return
      const revision = mailbox.messages.map(message => [message.id, message.escalations]).sort().map(parts => parts.join(':')).join('|')
      if (!revision)
        return
      const { events } = await session.history(agent.session.id)
      if ([...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => message.source.kind === 'supermesh-mailbox' && message.source.revision === revision))
        return
      if (events.some(event => (event.type === 'user/message' ? [event.data] : event.type === 'agent/inbox/spliced' ? event.data.inserted : []).some(message => message.source.kind === 'supermesh-mailbox' && message.source.revision === revision)))
        return
      const text = `你有${mailbox.pendingCount}个未处理邮件。用 read_mailbox 读取邮件和项目上下文，处理完成后显式完成邮件。`
      const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'supermesh-mailbox', form: 'notice', summary: text, revision } })
      if (stopped || !(await session.resolve(agent.session.id)))
        return
      agent.followup(message)
    },
  ),
  async peek(id: string) {
    const identity = await session.resolve(id)
    if (!identity)
      return null
    const scope = scopeOf(identity)
    if (!scope)
      return null
    const rows = await db.inbox.listScoped(scope)
    const triggers = new Map<string, { kind: string, actorName: string | null, human: boolean, mentioned: boolean, strength: TriggerStrength }>()
    for (const triggerId of new Set(rows.map(message => message.triggerId).filter(Boolean) as string[])) {
      const trigger = await db.trigger.findById(triggerId)
      if (trigger)
        triggers.set(triggerId, { kind: trigger.kind, actorName: trigger.actorName, human: Boolean(trigger.human), mentioned: Boolean(trigger.mentioned), strength: await triggerStrength(trigger) })
    }
    // 话题归属和仓库名是服务端事实：主编排据此决定归哪个项目，不必拿显示名或远程地址猜。
    const threads = new Map<string, { id: string, kind: ThreadKind, refId: string, title: string, url: string | null, triage: ThreadTriage, projectId: string | null, repository: string | null, project: { id: string, name: string, enabled: boolean } | null }>()
    for (const threadId of new Set(rows.map(message => message.threadId).filter(Boolean) as string[])) {
      const thread = await db.thread.findById(threadId)
      if (!thread)
        continue
      const owner = thread.projectId ? await db.project.findById(thread.projectId) : undefined
      threads.set(thread.id, { id: thread.id, kind: thread.kind, refId: thread.refId, title: thread.title, url: thread.url, triage: thread.triage, projectId: thread.projectId, repository: thread.channelId === 'github' || thread.channelId === 'gitlab' ? repositoryOf(thread.url) : null, project: owner ? { id: owner.id, name: owner.name, enabled: Boolean(owner.enabled) } : null })
    }
    const messages = rows.map(message => ({ ...message, ...(message.triggerId && triggers.has(message.triggerId) ? { trigger: triggers.get(message.triggerId)! } : {}), ...(message.threadId && threads.has(message.threadId) ? { thread: threads.get(message.threadId)! } : {}) }))
    const projects = (await db.project.listAll()).filter(project => project.enabled && (identity.role === 'main' || project.id === identity.projectId)).map(({ id, name, directory, remoteUrl }) => ({ id, name, directory, remoteUrl, repository: repositoryOf(remoteUrl) }))
    return { sessionId: id, role: scope.type, projects, pendingCount: messages.length, messages }
  },
  async read(id: string, ids?: string[]) {
    const mailbox = await inbox.peek(id)
    if (!mailbox)
      throw new Error('unknown_session')
    const now = new Date().toISOString()
    const selected = ids?.length ? mailbox.messages.filter(message => ids.includes(message.id)) : mailbox.messages
    await db.inbox.markRead(selected.filter(message => !message.readAt).map(message => message.id), now)
    if (!ids?.length)
      return mailbox
    const missing = ids.filter(id => !mailbox.messages.some(message => message.id === id))
    return { ...mailbox, messages: selected, missing }
  },
  async complete(id: string, ids: string[]): Promise<number> {
    const identity = await session.resolve(id)
    if (!identity)
      throw new Error('unknown_session')
    const scope = scopeOf(identity)
    if (!scope)
      throw new Error('unknown_session')
    return db.inbox.completeScoped(ids, scope, new Date().toISOString())
  },
  start(): () => Promise<void> {
    if (singlet.busy('inbox:delivery') || singlet.busy('inbox:answers'))
      throw new Error('inbox_busy')
    stopped = false
    return async () => {
      stopped = true
      await Promise.allSettled([singlet.drain()])
    }
  },
  deliver: singlet('inbox:delivery', async () => {
    const settings = await setting.load()
    const notified = new Set<string>()
    const woken = new Set<string>()
    for (const message of await db.inbox.listDelivery()) {
      if (stopped)
        break
      const key = [message.type, message.projectId, message.supervisorId, message.ticketId].join(':')
      if (message.ticketId && (await db.ticket.findById(message.ticketId))?.paused)
        continue
      if (message.type === 'project' && message.projectId && !(await db.project.findById(message.projectId))?.enabled)
        continue
      if (message.type === 'supervisor' && message.supervisorId && (await db.supervisor.findById(message.supervisorId))?.status !== 'active')
        continue
      if (notified.has(key))
        continue
      if (message.status === 'stalled' || (message.nextRetryAt && message.nextRetryAt > new Date().toISOString()))
        continue
      try {
        const id = await recipient(message)
        if (!id)
          throw new Error('recipient_session_unavailable')
        const agent = await session.activate(id)
        if (stopped)
          break
        // 一条通知覆盖收件人当前所有待处理邮件，同一轮里不必为每条邮件重算一次。
        if (agent.status === 'idle' && !woken.has(id)) {
          woken.add(id)
          await inbox.notify(agent)
        }
        notified.add(key)
        await db.inbox.resetDelivery(message.id)
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
  }),
  deliverAnswers: singlet('inbox:answers', async () => {
    for (const message of await db.inbox.listAnswered()) {
      if (stopped)
        break
      if (!message.answer || (message.nextRetryAt && message.nextRetryAt > new Date().toISOString()))
        continue
      try {
        // 编排会话只收紧凑通知：答案落成一条邮件，由收件人自己 read_mailbox 取。
        if (message.origin !== 'worker') {
          await db.inbox.enqueueAnswer(message)
          await db.inbox.settleAnswer(message.id, new Date().toISOString())
          continue
        }
        if (message.ticketId && (await db.ticket.findById(message.ticketId))?.paused)
          continue
        const worker = message.workerId ? await db.worker.findById(message.workerId) : undefined
        if (!worker) {
          await db.inbox.relayAnswer(message.id, '提问的 Worker 记录已不存在，答案没能送到它手里', new Date().toISOString())
          continue
        }
        // 还没派工的 Worker 先不收答案：等它跑起来的那一轮再送，别把记录直接改成 running。
        if (worker.status === 'queued')
          continue
        // ended 只是「这一轮跑完了」，会话还在就还能续：把 Worker 重新拉起来把答案送回去。
        // 只有会话已经归档（resolve 不到）才改投项目编排，并说明退回原因。
        if (!(await session.resolve(worker.id))) {
          await db.inbox.relayAnswer(message.id, `${worker.id} 的会话已归档或日志缺失，答案没能送到它手里`, new Date().toISOString())
          continue
        }
        await resumeWorker(worker)
        await session.activate(worker.id)
        await session.send(worker.id, `[Answer ${message.id}] ${message.answer}`, 'reply', `supermesh:answer:${message.id}`)
        await db.inbox.finishAnswer(message.id, new Date().toISOString())
      }
      catch (error) {
        if (stopped)
          break
        const reason = error instanceof Error ? error.message : String(error)
        const settings = await setting.load()
        const attempts = message.deliveryAttempts + 1
        const delays = Math.min(2 ** Math.min(attempts, 20), settings.deliveryRetryCeilingSeconds) * 1000
        await db.inbox.recordDeliveryFailure(message.id, reason, new Date(Date.now() + delays).toISOString())
        // 已答的 ask 不再转 stalled：投递失败到上限就把答案改投项目编排，行本身收尾。
        if (attempts >= settings.deliveryMaxAttempts)
          await db.inbox.relayAnswer(message.id, `答案投递失败（${reason}）`, new Date().toISOString())
      }
    }
  }),
})

/**
 * 把已经结束、但会话还在的 Worker 重新拉起来。
 *
 * 答案要送进一个 ended 的 Worker，光 send 不够：worker 记录不回到 running，
 * 这一轮结束时就没人收尾（observe 只认 running），票会一直停在原状态。
 */
async function resumeWorker(worker: Selectable<DB['worker']>): Promise<void> {
  if (worker.status !== 'ended')
    return
  const now = new Date().toISOString()
  await db.worker.update(worker.id, { status: 'running', endedAt: null, endedReason: null })
  const ticket = await db.ticket.findById(worker.ticketId)
  if (ticket && ticket.status !== 'done' && ticket.status !== 'cancelled')
    await db.ticket.start(ticket.id, now, now)
}

async function recipient(message: Message): Promise<string> {
  if (message.type === 'main')
    return session.create('main', {})
  if (message.type === 'project' && message.projectId)
    return session.create('project', { projectId: message.projectId })
  if (message.type === 'supervisor' && message.supervisorId)
    return session.create('supervisor', { supervisorId: message.supervisorId })
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
