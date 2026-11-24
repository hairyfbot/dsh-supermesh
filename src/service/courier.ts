import type { Selectable } from 'kysely'
import type { ChannelId, ChannelRow, CollectOutcome, DeliveryResult } from '@/channel/_shared/types'
import type { DB } from '@/database/types'
import type {
  AnswerPort,
  CollectContext,
  CollectPort,
  Cursor,
  DeliveryPort,
  FetchedPage,
  InboxRow,
  IngestPort,
  Receipt,
  StreamInput,
  ThreadRow,
  TicketRow,
  TriggerTarget,
} from '@/service/courier.types'
import { channelTriggerRejection, channelTriggerStrength } from '@/channel/_shared/admission'
import { ChannelError } from '@/channel/_shared/error'
import { digest, identity, now, timestamp } from '@/channel/_shared/primitives'
import { db } from '@/database'
import { singlet } from '@/runtime/singlet'
import { setting } from '@/service/setting'
import { defineService } from '@/utils/service'

/** 没有活票的话题，最后一次活动超过这个时长就不再轮询（官方 POLL_HORIZON_MS）。 */
const POLL_HORIZON_MS = 14 * 24 * 3600_000

/** 同话题投递串行化：同一时刻只允许一条在途，避免重复发言。 */
const publishing = new Map<string, Promise<void>>()

export const courier = defineService({
  async state<T>(channel: ChannelId, scope: string, name: string): Promise<T | undefined> {
    const row = await db.sourceState.find(channel, `${scope}:${name}`)
    return row ? JSON.parse(row.value) as T : undefined
  },
  async record(channel: ChannelId, scope: string, name: string, value: unknown): Promise<void> {
    await db.sourceState.set(channel, `${scope}:${name}`, JSON.stringify(value), now())
  },
  async pages(fetchPage: (page: number) => Promise<FetchedPage>): Promise<{ rows: ChannelRow[], notModified: boolean, etag: string | null }> {
    const rows: ChannelRow[] = []
    let etag: string | null = null
    for (let page = 1; ; page++) {
      const value = await fetchPage(page)
      if (page === 1) {
        if (value.notModified)
          return { rows: [], notModified: true, etag: value.etag ?? null }
        etag = value.etag ?? null
      }
      rows.push(...value.rows)
      if (value.rows.length < 100)
        return { rows, notModified: false, etag }
    }
  },
  page<T>(items: T[], offset: number, limit: number): { items: T[], next_offset: number | null } {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ChannelError('invalid_pagination')
    return { items: items.slice(offset, offset + limit), next_offset: offset + limit < items.length ? offset + limit : null }
  },
  async stream(input: StreamInput): Promise<void> {
    const cursor = await courier.state<Cursor>(input.channel, input.scope, `cursor:${input.name}`) ?? input.initial
    const startedAt = now()
    const value = await input.read(cursor)
    if (value.notModified)
      return
    const revisions: string[] = []
    let firstError: unknown
    for (const row of value.rows) {
      input.signal?.throwIfAborted()
      try {
        await input.accept(row)
      }
      catch (error) {
        if (input.signal?.aborted)
          throw error
        firstError ??= error
      }
      revisions.push(digest(row))
    }
    if (firstError)
      throw firstError
    const signature = digest(revisions.sort())
    const next: Cursor = { ...input.advance(cursor, value.rows, startedAt), signature, through: startedAt }
    if (value.etag !== undefined)
      next.etag = value.etag
    await courier.record(input.channel, input.scope, `cursor:${input.name}`, next)
  },
  /**
   * 触发邮件的收件人：有票跟着就投给票所在项目；没有票时按话题分诊结论投给主编排或项目。
   * 无论投给谁，都把话题已匹配的项目一起带上 —— 主编排据此知道该翻哪个项目的上下文，不必拿仓库名猜。
   */
  route(thread: ThreadRow, ticket: Pick<TicketRow, 'id' | 'projectId'> | null): TriggerTarget {
    if (ticket)
      return { key: ticket.projectId, type: 'project', projectId: ticket.projectId, ticketId: ticket.id }
    const claimed = thread.triage === 'claimed' ? thread.projectId : null
    return { key: claimed ?? 'main', type: claimed ? 'project' : 'main', projectId: thread.projectId, ticketId: null }
  },
  async ingest(port: IngestPort, thread: ThreadRow, row: ChannelRow, kind: 'open' | 'comment' | 'close', baseline: string, sourceKind: string): Promise<void> {
    const bots = await port.bots()
    const actorName = port.actor(row)
    // bots() 就是我们在该渠道的登录账号；它自己开的 issue 会以 self 强度送回主编排，其余消息不产生触发，第三方 bot 只是上下文。
    const self = actorName !== '' && bots.some(bot => bot.name.toLowerCase() === actorName.toLowerCase())
    const human = port.human(row, bots)
    const body = port.body(row)
    const mentioned = port.mentioned(body, bots)
    const at = port.at(row)
    const id = `${thread.id}:${sourceKind}:${identity(row.id)}`
    await db.trigger.ingest({ id, channelId: port.channel, threadId: thread.id, kind, actorName, human: Number(human), mentioned: Number(mentioned), text: body, url: port.url(row, sourceKind, thread), at, ref: port.ref(row) })
    const subscriptions = await db.ticketThread.listTicketIds(thread.id)
    const historical = port.createdAt(row) < baseline
    const { administrators, inferred } = await setting.load()
    const admin = administrators.some(name => name.toLowerCase() === actorName.toLowerCase())
    const admission = { self, human, historical, subscribed: subscriptions.length > 0, admin, mentioned, kind, issue: thread.kind === 'issue', ignored: thread.triage === 'ignored', inferred }
    const strength = channelTriggerStrength(admission)
    if (!strength) {
      // 白名单为空或没加这个人时，@bot 会被静默丢弃；这种「点名了却没反应」必须留痕。
      if (mentioned && channelTriggerRejection(admission) === 'not_administrator') {
        await courier.record(port.channel, 'admission', 'last_drop', { reason: 'not_administrator', actor: actorName, threadId: thread.id, at: now() })
        console.warn(`[${port.channel}:ingest] ${thread.url ?? thread.id} ${actorName} -> not_administrator`)
      }
      return
    }
    const targets = new Map<string, TriggerTarget>()
    for (const ticketId of subscriptions) {
      const ticket = await db.ticket.findById(ticketId)
      if (!ticket)
        continue
      if (['done', 'cancelled'].includes(ticket.status)) {
        if (!mentioned)
          continue
        const resumed = await db.ticket.reopen(ticketId, at)
        if (resumed) {
          await db.worker.queue(ticketId, ticket.projectId)
          const target = courier.route(thread, ticket)
          targets.set(target.key, target)
        }
        continue
      }
      // 机器人消息只作上下文：重新开工必须是人说的，不能让 bot / CI 借订阅把票从 review 拉回队列。
      if (human)
        await port.onSubscribedTicket?.(ticket)
      const target = courier.route(thread, ticket)
      targets.set(target.key, target)
    }
    if (!subscriptions.length) {
      // self 是主编排自己开的活，收件人只能是主编排：话题已被采集侧写上 projectId 也不改投项目。
      const target: TriggerTarget = strength === 'self'
        ? { key: 'main', type: 'main', projectId: thread.projectId, ticketId: null }
        : courier.route(thread, null)
      targets.set(target.key, target)
    }
    for (const target of targets.values())
      await db.inbox.enqueue({ id: `${id}:inbox:${target.key}`, type: target.type, origin: 'channel', kind: 'trigger', message: body, title: thread.title, projectId: target.projectId, ticketId: target.ticketId, triggerId: id, threadId: thread.id })
  },
  async answers(port: AnswerPort, thread: ThreadRow, row: ChannelRow): Promise<void> {
    if (!(await port.admin(row)))
      return
    const body = typeof row.body === 'string' ? row.body : ''
    const { answers: found, conflicts } = await port.parse(body, thread)
    const scope = await port.scope(thread)
    for (const [id, answer] of found) {
      if (conflicts.has(id))
        continue
      const ask = await db.inbox.findById(id)
      if (!ask || ask.kind !== 'ask' || ask.type !== 'user' || ask.status !== 'pending' || timestamp(row.created_at ?? row.submitted_at) < ask.createdAt)
        continue
      const trigger = ask.triggerId && await db.trigger.findById(ask.triggerId)
      if (!trigger || trigger.threadId !== thread.id || (ask.threadId && ask.threadId !== thread.id))
        continue
      const receipt = await courier.state<Receipt>(port.channel, scope, `comment:${id}`)
      if (!receipt)
        continue
      if (ask.ticketId) {
        const ticket = await db.ticket.findById(ask.ticketId)
        if (!ticket || ['done', 'cancelled'].includes(ticket.status))
          continue
      }
      await db.inbox.answerByUser(id, answer, now())
    }
  },
  async publish<Resource>(port: DeliveryPort<Resource>, inboxId: string, signal?: AbortSignal): Promise<DeliveryResult> {
    const destination = async (row: InboxRow): Promise<{ thread: ThreadRow, target: Resource, project: { id: string } }> => {
      if (row.type !== 'user' || !['notice', 'ask'].includes(row.kind) || !row.triggerId)
        throw new ChannelError('invalid_delivery')
      const trigger = await db.trigger.findById(row.triggerId)
      const thread = trigger && await db.thread.findById(trigger.threadId)
      if (!thread?.url || thread.channelId !== port.channel || !['issue', 'pull'].includes(thread.kind) || (row.threadId && row.threadId !== thread.id))
        throw new ChannelError('no_reply_address')
      const target = await port.parse(thread.url)
      const project = await projectFor(port, thread, target)
      if (row.ticketId) {
        const ticket = await db.ticket.findById(row.ticketId)
        if (row.kind === 'ask' && ticket && ['done', 'cancelled'].includes(ticket.status))
          throw new ChannelError('delivery_superseded')
        if (!ticket || ticket.projectId !== project.id)
          throw new ChannelError('scope_denied')
        if (ticket.paused)
          throw new ChannelError('human_paused')
        if (!(await db.ticketThread.listTicketIds(thread.id)).includes(ticket.id))
          throw new ChannelError('unsubscribed_thread')
      }
      return { thread, target, project }
    }
    const deliver = async (): Promise<DeliveryResult> => {
      let row = await db.inbox.findById(inboxId)
      if (!row)
        return { ok: false, reason: 'unknown_delivery' }
      if (row.status === 'done')
        return { ok: true }
      let posting = false
      try {
        const { thread, target, project } = await destination(row)
        const environment = await port.probe(project.id, signal)
        const scope = port.scope(target)
        const marker = `<!-- supermesh:${row.id} -->`
        const receipt = await courier.state<Receipt>(port.channel, scope, `comment:${row.id}`)
        if (receipt) {
          if (receipt.providerId !== environment.providerId || receipt.marker !== marker)
            throw new ChannelError('managed_comment_mismatch')
          if (row.kind === 'notice')
            await db.inbox.markDone(row.id, now())
          return { ok: true, remoteId: receipt.remoteId }
        }
        if (row.nextRetryAt && row.nextRetryAt > now())
          return { ok: false, reason: 'retry_pending' }
        for (const previous of await db.inbox.listOutgoing()) {
          if (previous.id === row.id || previous.seq >= row.seq || previous.ticketId !== row.ticketId || previous.status === 'done')
            continue
          const priorThread = previous.threadId ?? (previous.triggerId ? (await db.trigger.findById(previous.triggerId))?.threadId : undefined)
          if (priorThread === thread.id && !(await courier.state<Receipt>(port.channel, scope, `comment:${previous.id}`)))
            return { ok: false, reason: 'earlier_delivery_pending' }
        }
        const comments = await port.comments(target, signal)
        const existing = comments.filter(comment => port.authorId(comment) === environment.providerId && port.body(comment).includes(marker))
        if (existing.length > 1)
          throw new ChannelError('ambiguous_delivery')
        let remote = existing[0]
        if (!remote) {
          if (row.status === 'stalled' || row.deliveryError === 'publishing') {
            await db.inbox.markStalled(row.id, 'transport_unknown')
            return { ok: false, reason: 'transport_unknown' }
          }
          const current = await db.inbox.findById(row.id)
          if (!current || current.status !== 'pending' || current.type !== row.type || current.kind !== row.kind)
            return { ok: false, reason: 'delivery_superseded' }
          await destination(current)
          await db.inbox.recordDeliveryFailure(row.id, 'publishing', now())
          posting = true
          const body = row.kind === 'ask' ? port.askPrompt(row) : row.message
          remote = await port.post(target, `${body}\n\n${marker}`, signal)
        }
        if (port.authorId(remote) !== environment.providerId || !port.body(remote).includes(marker))
          throw new ChannelError('managed_comment_mismatch')
        const result = { remoteId: identity(remote.id), providerId: environment.providerId, marker, url: port.commentUrl(remote, target) }
        await courier.record(port.channel, scope, `comment:${row.id}`, result)
        await db.inbox.resetDelivery(row.id)
        if (row.kind === 'notice')
          await db.inbox.markDone(row.id, now())
        return { ok: true, remoteId: result.remoteId }
      }
      catch (error) {
        const reason = courier.failure(error, port.detail)
        if (posting && !['rate_limited', 'forbidden', 'not_found', 'not_logged_in', 'remote_rejected'].includes(reason)) {
          await db.inbox.markStalled(row.id, 'transport_unknown')
        }
        else if (!['human_paused', 'project_disabled', 'channel_disabled', 'retry_pending', ...port.skipReasons].includes(reason)) {
          row = (await db.inbox.findById(row.id))!
          const settings = await setting.load()
          const attempts = row.deliveryAttempts + (posting ? 0 : 1)
          if (attempts >= settings.deliveryMaxAttempts) {
            await db.inbox.markStalled(row.id, reason)
          }
          else {
            const seconds = courier.retryDelay(error, attempts, settings.deliveryRetryCeilingSeconds)
            const nextRetryAt = new Date(Date.now() + seconds * 1000).toISOString()
            if (posting)
              await db.inbox.update(row.id, { deliveryError: reason, nextRetryAt })
            else
              await db.inbox.recordDeliveryFailure(row.id, reason, nextRetryAt)
          }
        }
        if (signal?.aborted)
          throw error
        return { ok: false, reason: posting && reason === 'interrupted' ? 'transport_unknown' : reason }
      }
    }
    return singlet.immediate(`${port.channel}:exclusive:publish:${inboxId}`, async () => {
      const row = await db.inbox.findById(inboxId)
      const trigger = row?.triggerId ? await db.trigger.findById(row.triggerId) : undefined
      const key = `${port.channel}:${trigger ? trigger.threadId : inboxId}`
      const previous = publishing.get(key) ?? Promise.resolve()
      const task = previous.then(deliver)
      const barrier = task.then(() => undefined, () => undefined)
      publishing.set(key, barrier)
      try {
        return await task
      }
      finally {
        if (publishing.get(key) === barrier)
          publishing.delete(key)
      }
    })
  },
  async flush<Resource>(port: DeliveryPort<Resource>, signal?: AbortSignal): Promise<({ id: string } & DeliveryResult)[]> {
    signal?.throwIfAborted()
    if (!(await db.channel.findById(port.channel))?.enabled)
      return []
    const results: ({ id: string } & DeliveryResult)[] = []
    for (const row of await db.inbox.listOutgoing()) {
      signal?.throwIfAborted()
      if (row.status !== 'pending')
        continue
      const trigger = row.triggerId && await db.trigger.findById(row.triggerId)
      if (trigger && trigger.channelId === port.channel)
        results.push({ id: row.id, ...await courier.publish(port, row.id, signal) })
    }
    return results
  },
  async harvest(port: CollectPort, signal?: AbortSignal): Promise<CollectOutcome[]> {
    signal?.throwIfAborted()
    if (!(await db.channel.findById(port.channel))?.enabled)
      return []
    const results: CollectOutcome[] = []
    for (const project of await db.project.listAll()) {
      signal?.throwIfAborted()
      if (!project.enabled || !(await port.scope(project)))
        continue
      const outcome = await courier.collect(port, project.id, undefined, signal)
      if (!outcome.ok)
        port.onFailure?.(project, outcome.reason ?? 'channel_operation_failed')
      results.push(outcome)
    }
    return results
  },
  async collect(port: CollectPort, projectId: string, branch?: string, signal?: AbortSignal): Promise<CollectOutcome> {
    if (branch) {
      await port.collectBranch(projectId, branch, signal)
      return { projectId, ok: true }
    }
    return singlet.immediate(`${port.channel}:exclusive:collect:${projectId}`, async () => {
      const errors: string[] = []
      let scope: string | undefined
      let project: Selectable<DB['project']> | undefined
      const context: CollectContext = {
        channel: port.channel,
        projectId,
        scope: '',
        baseline: '',
        environment: { providerId: '', login: '', repositoryId: '' },
        attempt: async (step, operation) => {
          try {
            await operation()
          }
          catch (error) {
            if (signal?.aborted)
              throw error
            errors.push(courier.reason(error, port.detail, step))
          }
        },
        fail: (error, step) => {
          if (signal?.aborted)
            throw error
          errors.push(courier.reason(error, port.detail, step))
        },
      }
      let ready = false
      try {
        project = await port.project(projectId)
        const environment = await port.probe(projectId, signal)
        // probe 可能把改名后的仓库写回项目，作用域必须按最新记录解析。
        const resolved = await port.scope(await port.project(projectId))
        if (!resolved)
          throw new ChannelError('unknown_repository')
        scope = resolved
        const baseline = await courier.state<string>(port.channel, scope, 'baseline') ?? now()
        await courier.record(port.channel, scope, 'baseline', baseline)
        context.scope = scope
        context.baseline = baseline
        context.environment = environment
        ready = true
      }
      catch (error) {
        if (signal?.aborted)
          throw error
        errors.push(courier.reason(error, port.detail, 'probe'))
      }
      if (ready) {
        try {
          await port.collect(context, signal)
        }
        catch (error) {
          if (signal?.aborted)
            throw error
          errors.push(courier.reason(error, port.detail, 'collect'))
        }
      }
      // probe 失败时作用域解析不出来，仍要按项目记录状态，否则整条采集链无声消失。
      if (port.status && project)
        await courier.record(port.channel, projectId, 'collection_status', { ok: !errors.length, reasons: [...new Set(errors)], collectedAt: now() })
      return errors.length ? { projectId, ok: false, reason: [...new Set(errors)].join(',') } : { projectId, ok: true }
    })
  },
  async polled(ticketIds: string[], updatedAt: string | null, at = Date.now()): Promise<boolean> {
    if (!ticketIds.length)
      return true
    const tickets = await Promise.all(ticketIds.map(id => db.ticket.findById(id)))
    if (tickets.some(ticket => !!ticket && !['done', 'cancelled'].includes(ticket.status)))
      return true
    const times = [updatedAt ?? '', ...tickets.map(ticket => ticket?.endedAt ?? '')].map(value => Date.parse(value)).filter(Number.isFinite)
    return times.length > 0 && at - Math.max(...times) < POLL_HORIZON_MS
  },
  failure(error: unknown, detail: boolean): string {
    if (error instanceof ChannelError)
      return error.hint ? `${error.code}(${error.hint})` : error.code
    if (error instanceof Error)
      return error.name === 'AbortError' ? 'interrupted' : detail ? `transport_unknown(${error.message.slice(0, 120)})` : 'transport_unknown'
    return 'transport_unknown'
  },
  /** 采集失败要能定位到步骤或接口：错误自带位置优先，其次用调用方给的步骤名。 */
  reason(error: unknown, detail: boolean, step?: string): string {
    const code = courier.failure(error, detail)
    const place = error instanceof ChannelError ? error.location : undefined
    const located = place ?? step
    return located ? `${code}:${located}` : code
  },
  retryDelay(error: unknown, attempts: number, ceiling: number): number {
    return Math.max(error instanceof ChannelError ? error.retryAfterSeconds ?? 0 : 0, Math.min(ceiling, 2 ** Math.max(1, attempts)))
  },
})

/** 话题仓库对不上任何项目时把两边地址写进失败原因，否则回复只会停在 unknown_repository，看不出差在哪。 */
async function projectFor<Resource>(port: DeliveryPort<Resource>, thread: ThreadRow, target: Resource): Promise<{ id: string }> {
  let project: { id: string } | undefined
  try {
    project = await port.projectFor(target)
  }
  catch (error) {
    if (!(error instanceof ChannelError) || error.code !== 'unknown_repository')
      throw error
  }
  if (project)
    return project
  const bound = thread.projectId ? await db.project.findById(thread.projectId) : undefined
  const scope = port.scope(target)
  throw new ChannelError('unknown_repository', undefined, undefined, bound?.remoteUrl ? `话题仓库 ${scope} 与项目远端地址 ${bound.remoteUrl} 不一致` : `话题仓库 ${scope} 未登记为项目`)
}
