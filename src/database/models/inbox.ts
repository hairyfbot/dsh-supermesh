import type { Insertable, Kysely, Selectable } from 'kysely'
import type { DB, InboxAnsweredBy, InboxTarget } from '../types'
import { randomUUID } from 'node:crypto'
import { Model } from 'kysely-model'

export type InboxScope = { type: 'main' } | { type: 'project', projectId: string } | { type: 'supervisor', supervisorId: string }

export class Inbox extends Model<DB, 'inbox'> {
  constructor(db: Kysely<DB>) {
    super(db, 'inbox', 'id')
  }

  async nextSeq(): Promise<number> {
    const row = await this.db
      .selectFrom('inbox')
      .select(this.db.fn.max('seq').as('max'))
      .executeTakeFirst()
    return Number(row?.max ?? 0) + 1
  }

  async listPending(type: InboxTarget, projectId?: string | null): Promise<Selectable<DB['inbox']>[]> {
    const query = this.db
      .selectFrom('inbox')
      .selectAll()
      .where('type', '=', type)
      .where('status', '=', 'pending')
    const scoped = projectId === undefined ? query : query.where('projectId', '=', projectId)
    return scoped.orderBy('seq').execute()
  }

  async countPending(type: InboxTarget, projectId?: string | null): Promise<number> {
    const query = this.db
      .selectFrom('inbox')
      .select(this.db.fn.countAll<number>().as('count'))
      .where('type', '=', type)
      .where('status', '=', 'pending')
    const scoped = projectId === undefined ? query : query.where('projectId', '=', projectId)
    const row = await scoped.executeTakeFirst()
    return Number(row?.count ?? 0)
  }

  async listPendingAsk(): Promise<Selectable<DB['inbox']>[]> {
    return this.db
      .selectFrom('inbox')
      .selectAll()
      .where('type', '=', 'user')
      .where('kind', '=', 'ask')
      .where('status', '=', 'pending')
      .orderBy('createdAt')
      .execute()
  }

  async markRead(ids: string[], readAt: string): Promise<void> {
    if (ids.length === 0)
      return
    await this.db
      .updateTable('inbox')
      .set({ readAt })
      .where('id', 'in', ids)
      .execute()
  }

  async markDone(id: string, doneAt: string): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set({ status: 'done', doneAt })
      .where('id', '=', id)
      .execute()
  }

  async answer(id: string, answer: string, answeredBy: InboxAnsweredBy, answeredAt: string): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set({ answer, answeredBy, answeredAt, status: 'done', doneAt: answeredAt })
      .where('id', '=', id)
      .execute()
  }

  async recordDeliveryFailure(id: string, deliveryError: string, nextRetryAt: string): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set(eb => ({ deliveryAttempts: eb('deliveryAttempts', '+', 1), deliveryError, nextRetryAt }))
      .where('id', '=', id)
      .execute()
  }

  async resetDelivery(id: string): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set({ deliveryAttempts: 0, deliveryError: null, nextRetryAt: null })
      .where('id', '=', id)
      .execute()
  }

  async markStalled(id: string, deliveryError: string): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set({ status: 'stalled', deliveryError, nextRetryAt: null })
      .where('id', '=', id)
      .execute()
  }

  async listRetryable(now: string): Promise<Selectable<DB['inbox']>[]> {
    return this.db
      .selectFrom('inbox')
      .selectAll()
      .where('status', '=', 'pending')
      .where('nextRetryAt', 'is not', null)
      .where('nextRetryAt', '<=', now)
      .orderBy('nextRetryAt')
      .execute()
  }

  async escalate(id: string, lastEscalatedAt: string): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set(eb => ({ escalations: eb('escalations', '+', 1), lastEscalatedAt }))
      .where('id', '=', id)
      .execute()
  }

  async reassign(id: string, type: InboxTarget, refs: { projectId?: string | null, supervisorId?: string | null } = {}): Promise<void> {
    await this.db
      .updateTable('inbox')
      .set({ type, ...refs })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['inbox']> | undefined> {
    return this.db.selectFrom('inbox').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listRecent(limit = 100): Promise<Selectable<DB['inbox']>[]> {
    return this.db.selectFrom('inbox').selectAll().orderBy('createdAt', 'desc').orderBy('id').limit(Math.max(1, Math.min(1000, limit))).execute()
  }

  async enqueue(value: Pick<Insertable<DB['inbox']>, 'type' | 'origin' | 'kind' | 'message'> & Partial<Insertable<DB['inbox']>>): Promise<Selectable<DB['inbox']>> {
    if (!['user', 'main', 'project', 'supervisor'].includes(value.type))
      throw new Error('invalid_inbox_recipient')
    const insert = async (trx: Kysely<DB>) => {
      const model = new Inbox(trx)
      if (value.id) {
        const existing = await model.findById(value.id)
        if (existing)
          return existing
      }
      const id = value.id ?? randomUUID()
      await model.create({
        id,
        seq: await model.nextSeq(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        projectId: null,
        supervisorId: null,
        title: null,
        doneAt: null,
        deliveryError: null,
        nextRetryAt: null,
        readAt: null,
        lastEscalatedAt: null,
        answer: null,
        answeredBy: null,
        answeredAt: null,
        triggerId: null,
        threadId: null,
        ticketId: null,
        workerId: null,
        ...value,
      })
      return (await model.findById(id))!
    }
    return this.db.isTransaction ? insert(this.db) : this.db.transaction().execute(insert)
  }

  async listByTicket(ticketId: string): Promise<Selectable<DB['inbox']>[]> {
    return this.db.selectFrom('inbox').selectAll().where('ticketId', '=', ticketId).orderBy('createdAt').orderBy('seq').execute()
  }

  async listScoped(scope: InboxScope, includeChannel = false): Promise<Selectable<DB['inbox']>[]> {
    if (!['main', 'project', 'supervisor'].includes(scope.type))
      throw new Error('invalid_inbox_recipient')
    let query = this.db.selectFrom('inbox').selectAll().where('type', '=', scope.type).where('status', 'in', ['pending', 'stalled'])
    if (!includeChannel)
      query = query.where('origin', '!=', 'channel')
    if (scope.type === 'project')
      query = query.where('projectId', '=', scope.projectId)
    if (scope.type === 'supervisor')
      query = query.where('supervisorId', '=', scope.supervisorId)
    return query.orderBy('createdAt').orderBy('seq').execute()
  }

  owns(row: Selectable<DB['inbox']>, scope: InboxScope, includeChannel = false): boolean {
    return ['main', 'project', 'supervisor'].includes(scope.type) && (includeChannel || row.origin !== 'channel') && row.type === scope.type && (scope.type !== 'project' || row.projectId === scope.projectId) && (scope.type !== 'supervisor' || row.supervisorId === scope.supervisorId)
  }

  async completeScoped(ids: string[], scope: InboxScope, now: string, includeChannel = false): Promise<number> {
    if (!ids.length)
      return 0
    return this.db.transaction().execute(async (trx) => {
      const model = new Inbox(trx)
      const rows = await trx.selectFrom('inbox').selectAll().where('id', 'in', [...new Set(ids)]).execute()
      if (rows.length !== new Set(ids).size || rows.some(row => !model.owns(row, scope, includeChannel)))
        throw new Error('收件箱不存在或不属于当前身份')
      if (rows.some(row => row.kind === 'ask' && row.status !== 'done'))
        throw new Error('answer_required')
      const result = await trx.updateTable('inbox').set({ status: 'done', doneAt: now }).where('id', 'in', ids).where('status', 'in', ['pending', 'stalled']).executeTakeFirst()
      return Number(result.numUpdatedRows)
    })
  }

  async answerScoped(id: string, text: string, scope: InboxScope, now: string): Promise<Selectable<DB['inbox']>> {
    return this.db.transaction().execute(async (trx) => {
      const model = new Inbox(trx)
      const row = await model.findById(id)
      if (!row || !model.owns(row, scope) || row.kind !== 'ask' || row.status === 'done')
        throw new Error('只能回答指向当前身份的 pending ask')
      await model.answer(id, text, scope.type, now)
      return row
    })
  }

  async escalateScoped(id: string, scope: InboxScope, now: string): Promise<Selectable<DB['inbox']>> {
    return this.db.transaction().execute(async (trx) => {
      const model = new Inbox(trx)
      const row = await model.findById(id)
      if (!row || !model.owns(row, scope) || row.kind !== 'ask' || row.status === 'done')
        throw new Error('只能升级指向当前身份的 pending ask')
      if (scope.type === 'main')
        throw new Error('主编排应通过 ask_user 询问人，不能自动升级')
      const supervisor = scope.type === 'project' && row.ticketId
        ? await trx.selectFrom('supervisor_ticket').innerJoin('supervisor', 'supervisor.id', 'supervisor_ticket.supervisorId').select('supervisor.id').where('ticketId', '=', row.ticketId).where('supervisor.status', '=', 'active').orderBy('supervisor.createdAt').executeTakeFirst()
        : undefined
      await trx.updateTable('inbox').set(eb => ({ type: supervisor ? 'supervisor' : 'main', supervisorId: supervisor?.id ?? (row.origin === 'supervisor' ? row.supervisorId : null), escalations: eb('escalations', '+', 1), lastEscalatedAt: now, readAt: null })).where('id', '=', id).execute()
      return (await model.findById(id))!
    })
  }

  async answerByUser(id: string, answer: string, answeredAt: string): Promise<Selectable<DB['inbox']> | undefined> {
    return this.db.updateTable('inbox').set({ answer, answeredBy: 'user', answeredAt, status: 'done', doneAt: answeredAt }).where('id', '=', id).where('type', '=', 'user').where('kind', '=', 'ask').where('status', '=', 'pending').returningAll().executeTakeFirst()
  }

  async enqueueAnswer(row: Selectable<DB['inbox']>): Promise<void> {
    if (!row.answer || !row.answeredBy || row.answeredBy === 'user' || (row.origin !== 'main' && row.origin !== 'project' && row.origin !== 'supervisor'))
      return
    await this.enqueue({ id: `supermesh:answer:${row.id}`, type: row.origin, origin: row.answeredBy, kind: 'notice', title: row.title, message: row.answer, projectId: row.projectId, supervisorId: row.supervisorId, ticketId: row.ticketId, workerId: row.workerId, threadId: row.threadId, triggerId: row.triggerId })
  }

  async listAnswered(): Promise<Selectable<DB['inbox']>[]> {
    return this.db.selectFrom('inbox').selectAll().where('kind', '=', 'ask').where('status', '=', 'done').where('answer', 'is not', null).orderBy('seq').execute()
  }

  async returnPendingTicket(ticketId: string, reason: string, now: string): Promise<void> {
    await this.db.updateTable('inbox').set({ status: 'stalled', deliveryError: reason, nextRetryAt: null, doneAt: now }).where('ticketId', '=', ticketId).where('status', '=', 'pending').execute()
  }

  async listDelivery(): Promise<Selectable<DB['inbox']>[]> {
    return this.db.selectFrom('inbox').selectAll().where('type', 'in', ['main', 'project', 'supervisor']).where('status', 'in', ['pending', 'stalled']).orderBy('seq').execute()
  }

  async listOutgoing(): Promise<Selectable<DB['inbox']>[]> {
    return this.db.selectFrom('inbox').selectAll().where('type', '=', 'user').where('triggerId', 'is not', null).where('kind', 'in', ['notice', 'ask']).where('status', 'in', ['pending', 'stalled']).orderBy('seq').execute()
  }

  async enqueueAsk(value: Pick<Insertable<DB['inbox']>, 'type' | 'origin' | 'message'> & Partial<Insertable<DB['inbox']>>): Promise<Selectable<DB['inbox']>> {
    return this.db.transaction().execute(async (trx) => {
      let query = trx.selectFrom('inbox').selectAll().where('kind', '=', 'ask').where('status', '=', 'pending').where('origin', '=', value.origin)
      if (value.workerId)
        query = query.where('workerId', '=', value.workerId)
      else if (value.origin === 'project' && value.ticketId)
        query = query.where('projectId', value.projectId ? '=' : 'is', value.projectId ?? null).where('ticketId', '=', value.ticketId)
      else query = query.where('projectId', value.projectId ? '=' : 'is', value.projectId ?? null).where('supervisorId', value.supervisorId ? '=' : 'is', value.supervisorId ?? null).where('triggerId', value.triggerId ? '=' : 'is', value.triggerId ?? null).where('message', '=', value.message)
      const pending = await query.executeTakeFirst()
      if (pending) {
        if (pending.message !== value.message)
          throw new Error(`当前工作线已有 pending ask：${pending.id}`)
        return pending
      }
      return new Inbox(trx).enqueue({ ...value, kind: 'ask' })
    })
  }
}
