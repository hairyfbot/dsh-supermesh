import type { Kysely, Selectable } from 'kysely'
import type { DB, ReportState, WorkerEndReason } from '../types'
import { randomUUID } from 'node:crypto'
import { Model } from 'kysely-model'
import { Inbox } from './inbox'
import { Ticket } from './ticket'

export class Worker extends Model<DB, 'worker'> {
  constructor(db: Kysely<DB>) {
    super(db, 'worker', 'id')
  }

  async listByTicket(ticketId: string): Promise<Selectable<DB['worker']>[]> {
    return this.db
      .selectFrom('worker')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .orderBy('createdAt')
      .execute()
  }

  async listRunning(): Promise<Selectable<DB['worker']>[]> {
    return this.db
      .selectFrom('worker')
      .selectAll()
      .where('status', '=', 'running')
      .orderBy('startedAt')
      .execute()
  }

  async findRunningByBranch(branch: string): Promise<Selectable<DB['worker']> | undefined> {
    return this.db
      .selectFrom('worker')
      .selectAll()
      .where('branch', '=', branch)
      .where('status', '=', 'running')
      .executeTakeFirst()
  }

  async findByBranch(branch: string): Promise<Selectable<DB['worker']> | undefined> {
    return this.db
      .selectFrom('worker')
      .selectAll()
      .where('branch', '=', branch)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst()
  }

  async start(id: string, startedAt: string): Promise<void> {
    await this.db
      .updateTable('worker')
      .set(eb => ({ status: 'running' as const, startedAt: eb.fn.coalesce('startedAt', eb.val(startedAt)) }))
      .where('id', '=', id)
      .execute()
  }

  async end(id: string, endedReason: WorkerEndReason, endedAt: string): Promise<void> {
    await this.db
      .updateTable('worker')
      .set({ status: 'ended', endedReason, endedAt })
      .where('id', '=', id)
      .execute()
  }

  async setReport(id: string, reportState: ReportState, report: string, reportAt: string): Promise<void> {
    await this.db
      .updateTable('worker')
      .set({ reportState, report, reportAt })
      .where('id', '=', id)
      .execute()
  }

  async setBackgroundUntil(id: string, backgroundUntil: string | null): Promise<void> {
    await this.db
      .updateTable('worker')
      .set({ backgroundUntil })
      .where('id', '=', id)
      .execute()
  }

  async setRecoveryNote(id: string, recoveryNote: string | null): Promise<void> {
    await this.db
      .updateTable('worker')
      .set({ recoveryNote })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['worker']> | undefined> {
    return this.db.selectFrom('worker').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listRecent(limit = 100): Promise<Selectable<DB['worker']>[]> {
    return this.db.selectFrom('worker').selectAll().orderBy('createdAt', 'desc').orderBy('id').limit(Math.max(1, Math.min(1000, limit))).execute()
  }

  async listQueued(): Promise<Selectable<DB['worker']>[]> {
    return this.db.selectFrom('worker').selectAll().where('status', '=', 'queued').orderBy('createdAt').execute()
  }

  async queue(ticketId: string, projectId: string, branch?: string): Promise<Selectable<DB['worker']>> {
    if (branch && branch.split('/').at(-1) !== ticketId)
      throw new Error('分支末段必须是任务号')
    return this.db.transaction().execute(async (trx) => {
      const ticket = await trx.selectFrom('ticket').selectAll().where('id', '=', ticketId).where('projectId', '=', projectId).executeTakeFirst()
      if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled')
        throw new Error('工单不存在、已结束或不属于当前项目')
      if (ticket.paused)
        throw new Error('工单已暂停')
      const project = await trx.selectFrom('project').selectAll().where('id', '=', projectId).executeTakeFirst()
      if (!project?.enabled)
        throw new Error('项目未启用')
      const existing = await trx.selectFrom('worker').selectAll().where('ticketId', '=', ticketId).where('status', '!=', 'ended').executeTakeFirst()
      if (existing)
        return existing
      const previous = await trx.selectFrom('worker').selectAll().where('ticketId', '=', ticketId).orderBy('createdAt', 'desc').orderBy('id', 'desc').executeTakeFirst()
      const now = new Date().toISOString()
      if (previous) {
        await trx.updateTable('worker').set({ status: 'queued', startedAt: null, endedAt: null, endedReason: null, reportState: null, report: null, reportAt: null, backgroundUntil: null, recoveryNote: null, branch: branch ?? previous.branch }).where('id', '=', previous.id).execute()
        await trx.updateTable('ticket').set({ status: 'queued', updatedAt: now }).where('id', '=', ticketId).execute()
        return (await new Worker(trx).findById(previous.id))!
      }
      const id = randomUUID()
      await trx.insertInto('worker').values({ id, ticketId, status: 'queued', createdAt: now, startedAt: null, endedAt: null, title: ticket.title, endedReason: null, branch: branch ?? `dsh/${ticketId}`, worktree: null, reportState: null, report: null, reportAt: null, backgroundUntil: null, recoveryNote: null }).execute()
      await trx.updateTable('ticket').set({ status: 'queued', updatedAt: now }).where('id', '=', ticketId).execute()
      return (await new Worker(trx).findById(id))!
    })
  }

  async requeue(id: string): Promise<void> {
    await this.db
      .updateTable('worker')
      .set({ status: 'queued', startedAt: null, endedAt: null, endedReason: null, reportState: null, report: null, reportAt: null, backgroundUntil: null })
      .where('id', '=', id)
      .execute()
  }

  async reportProgress(id: string, reportState: ReportState, report: string): Promise<Selectable<DB['inbox']>> {
    return this.db.transaction().execute(async (trx) => {
      const worker = await new Worker(trx).findById(id)
      if (!worker || worker.status === 'ended')
        throw new Error('Worker 已结束或不存在')
      const ticket = await trx.selectFrom('ticket').selectAll().where('id', '=', worker.ticketId).executeTakeFirst()
      if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled')
        throw new Error('工单已结束或不存在')
      const now = new Date().toISOString()
      await new Worker(trx).setReport(id, reportState, report, now)
      const message = await new Inbox(trx).enqueue({ type: 'project', projectId: ticket.projectId, origin: 'worker', kind: 'ticket', ticketId: ticket.id, workerId: id, title: reportState, message: report })
      if (reportState === 'ready')
        await new Ticket(trx).endOnReport(ticket.id, now)
      return message
    })
  }
}
