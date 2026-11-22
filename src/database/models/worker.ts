import type { Kysely, Selectable } from 'kysely'
import type { DB, ReportState, WorkerEndReason } from '@/database/types'
import { randomUUID } from 'node:crypto'
import { Model } from 'kysely-model'
import { Ticket } from '@/database/models/ticket'

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

  /**
   * 把票放进派工队列。`fresh` 为真时新建一个 worker 记录（沿用原分支与 worktree），
   * 用于旧会话已被归档、无法再激活的情形 —— 那时复用同一个 id 只会一直失败。
   */
  async queue(ticketId: string, projectId: string, branch?: string, fresh = false): Promise<Selectable<DB['worker']>> {
    if (branch && !/^[\w./-]+$/.test(branch))
      throw new Error('分支名必须是纯 ASCII')
    return this.db.transaction().execute(async (trx) => {
      const ticket = await trx.selectFrom('ticket').selectAll().where('id', '=', ticketId).where('projectId', '=', projectId).executeTakeFirst()
      if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled')
        throw new Error('工单不存在、已结束或不属于当前项目')
      if (ticket.paused)
        throw new Error('工单已暂停')
      const project = await trx.selectFrom('project').selectAll().where('id', '=', projectId).executeTakeFirst()
      if (!project?.enabled)
        throw new Error('项目未启用')
      // 依赖约束在排队这一层统一拦：create_worker、派工循环、rescue 都走这里，
      // 只在派工循环里检查会被其它入口绕过（前置还没做完，后继就开工了）。
      const depends = await trx.selectFrom('ticket_link').select('relatedId').where('ticketId', '=', ticketId).where('kind', '=', 'depends').execute()
      for (const link of depends) {
        const related = await trx.selectFrom('ticket').select(['id', 'status']).where('id', '=', link.relatedId).executeTakeFirst()
        if (related && related.status !== 'done' && related.status !== 'cancelled')
          throw new Error(`依赖的 ${related.id} 还没完成`)
      }
      const existing = await trx.selectFrom('worker').selectAll().where('ticketId', '=', ticketId).where('status', '!=', 'ended').executeTakeFirst()
      if (existing)
        return existing
      const previous = await trx.selectFrom('worker').selectAll().where('ticketId', '=', ticketId).orderBy('createdAt', 'desc').orderBy('id', 'desc').executeTakeFirst()
      const now = new Date().toISOString()
      if (previous && !fresh) {
        await trx.updateTable('worker').set({ status: 'queued', startedAt: null, endedAt: null, endedReason: null, reportState: null, report: null, reportAt: null, backgroundUntil: null, recoveryNote: null, branch: branch ?? previous.branch }).where('id', '=', previous.id).execute()
        await trx.updateTable('ticket').set({ status: 'queued', updatedAt: now }).where('id', '=', ticketId).execute()
        return (await new Worker(trx).findById(previous.id))!
      }
      const id = randomUUID()
      await trx.insertInto('worker').values({ id, ticketId, status: 'queued', createdAt: now, startedAt: null, endedAt: null, title: ticket.title, endedReason: null, branch: branch ?? previous?.branch ?? null, worktree: previous?.worktree ?? null, reportState: null, report: null, reportAt: null, backgroundUntil: null, recoveryNote: null }).execute()
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

  async reportProgress(id: string, reportState: ReportState, report: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const worker = await new Worker(trx).findById(id)
      if (!worker || worker.status === 'ended')
        throw new Error('Worker 已结束或不存在')
      const ticket = await trx.selectFrom('ticket').selectAll().where('id', '=', worker.ticketId).executeTakeFirst()
      if (!ticket || ticket.status === 'done' || ticket.status === 'cancelled')
        throw new Error('工单已结束或不存在')
      const now = new Date().toISOString()
      await new Worker(trx).setReport(id, reportState, report, now)
      if (reportState === 'ready')
        await new Ticket(trx).endOnReport(ticket.id, now)
    })
  }
}
