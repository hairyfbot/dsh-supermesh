import type { Insertable, Kysely, Selectable, Updateable } from 'kysely'
import type { CiState, DB, PullRequestState, TicketStatus } from '../types'
import { Model } from 'kysely-model'

const CLOSED_STATUS: readonly TicketStatus[] = ['done', 'cancelled']

export class Ticket extends Model<DB, 'ticket'> {
  constructor(db: Kysely<DB>) {
    super(db, 'ticket', 'id')
  }

  async listByProject(projectId: string, status?: TicketStatus): Promise<Selectable<DB['ticket']>[]> {
    const query = this.db
      .selectFrom('ticket')
      .selectAll()
      .where('projectId', '=', projectId)
    const scoped = status ? query.where('status', '=', status) : query
    return scoped.orderBy('updatedAt', 'desc').execute()
  }

  async listOpen(): Promise<Selectable<DB['ticket']>[]> {
    return this.db
      .selectFrom('ticket')
      .selectAll()
      .where('status', 'not in', [...CLOSED_STATUS])
      .orderBy('updatedAt', 'desc')
      .execute()
  }

  async countRunning(): Promise<number> {
    const row = await this.db
      .selectFrom('ticket')
      .select(this.db.fn.countAll<number>().as('count'))
      .where('status', '=', 'running')
      .executeTakeFirst()
    return Number(row?.count ?? 0)
  }

  async listDispatchable(): Promise<Selectable<DB['ticket']>[]> {
    return this.db
      .selectFrom('ticket')
      .selectAll()
      .where('status', 'in', ['waiting', 'queued'])
      .where('paused', '=', 0)
      .orderBy('createdAt')
      .execute()
  }

  async start(id: string, startedAt: string, updatedAt: string): Promise<void> {
    await this.db
      .updateTable('ticket')
      .set({ status: 'running', startedAt, updatedAt })
      .where('id', '=', id)
      .execute()
  }

  async finish(id: string, status: TicketStatus, endedAt: string, updatedAt: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('ticket')
        .set({ status, endedAt, updatedAt, prepareError: null })
        .where('id', '=', id)
        .execute()
      await trx
        .updateTable('inbox')
        .set({ status: 'done', doneAt: endedAt })
        .where('ticketId', '=', id)
        .where('kind', '=', 'ask')
        .where('status', 'in', ['pending', 'stalled'])
        .execute()
    })
  }

  async setPullRequest(id: string, prUrl: string | null, prState: PullRequestState | null, ciState: CiState | null): Promise<void> {
    await this.db
      .updateTable('ticket')
      .set({ prUrl, prState, ciState })
      .where('id', '=', id)
      .execute()
  }

  async setPaused(id: string, paused: boolean, updatedAt: string): Promise<void> {
    await this.db
      .updateTable('ticket')
      .set({ paused: paused ? 1 : 0, updatedAt })
      .where('id', '=', id)
      .execute()
  }

  async setPrepareError(id: string, prepareError: string | null, updatedAt: string): Promise<void> {
    await this.db
      .updateTable('ticket')
      .set({ prepareError, updatedAt })
      .where('id', '=', id)
      .execute()
  }

  async save(id: string, patch: Updateable<DB['ticket']>): Promise<void> {
    await this.db
      .updateTable('ticket')
      .set(patch)
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['ticket']> | undefined> {
    return this.db.selectFrom('ticket').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listRecent(limit = 100): Promise<Selectable<DB['ticket']>[]> {
    return this.db.selectFrom('ticket').selectAll().orderBy('createdAt', 'desc').orderBy('id').limit(Math.max(1, Math.min(1000, limit))).execute()
  }

  async listFiltered(filters: { projectId?: string, status?: TicketStatus, attentionOnly?: boolean, supervisorId?: string } = {}): Promise<(Selectable<DB['ticket']> & { attention: boolean | number })[]> {
    let query = this.db.selectFrom('ticket').selectAll('ticket').select(eb => eb.exists(eb.selectFrom('inbox').select('id').whereRef('inbox.ticketId', '=', 'ticket.id').where('kind', '=', 'ask').where('inbox.status', '=', 'pending')).as('attention'))
    if (filters.projectId)
      query = query.where('ticket.projectId', '=', filters.projectId)
    if (filters.status)
      query = query.where('ticket.status', '=', filters.status)
    else query = query.where('ticket.status', 'not in', ['done', 'cancelled'])
    if (filters.attentionOnly)
      query = query.where(eb => eb.exists(eb.selectFrom('inbox').select('id').whereRef('inbox.ticketId', '=', 'ticket.id').where('kind', '=', 'ask').where('inbox.status', '=', 'pending')))
    if (filters.supervisorId)
      query = query.where(eb => eb.exists(eb.selectFrom('supervisor_ticket').select('ticketId').whereRef('supervisor_ticket.ticketId', '=', 'ticket.id').where('supervisorId', '=', filters.supervisorId!)))
    return query.orderBy('ticket.createdAt').orderBy('ticket.id').execute()
  }

  async createWithThreads(projectId: string, title: string, threadIds: string[], description?: string): Promise<Selectable<DB['ticket']>> {
    if (!threadIds.length)
      throw new Error('至少需要一条来源话题')
    return this.db.transaction().execute(async (trx) => {
      const project = await trx.selectFrom('project').selectAll().where('id', '=', projectId).executeTakeFirst()
      if (!project)
        throw new Error('项目不存在')
      const ids = [...new Set(threadIds)]
      const threads = await trx.selectFrom('thread').selectAll().where('id', 'in', ids).execute()
      if (threads.length !== ids.length)
        throw new Error('来源话题不存在')
      const duplicate = await trx.selectFrom('ticket_thread').select('ticketId').where('threadId', 'in', ids).executeTakeFirst()
      if (duplicate)
        throw new Error(`来源话题已关联工单：${duplicate.ticketId}`)
      const now = new Date().toISOString()
      const previous = await trx.selectFrom('ticket').select('id').execute()
      const highest = previous.reduce((max, row) => {
        const match = /^T-(\d+)$/.exec(row.id)
        return match ? Math.max(max, Number(match[1])) : max
      }, 0)
      let sequence = highest
      let id = `T-${String(sequence + 1).padStart(3, '0')}`
      while (await trx.selectFrom('ticket').select('id').where('id', '=', id).executeTakeFirst()) {
        sequence++
        id = `T-${String(sequence + 1).padStart(3, '0')}`
      }
      const row: Insertable<DB['ticket']> = { id, projectId, channelId: threads.find(row => row.id === ids[0])!.channelId, title, description: description ?? null, status: 'waiting', createdAt: now, updatedAt: now, startedAt: null, endedAt: null, prUrl: null, prState: null, ciState: null, prepareError: null }
      await trx.insertInto('ticket').values(row).execute()
      for (const [index, threadId] of ids.entries()) await trx.insertInto('ticket_thread').values({ ticketId: id, threadId, createdAt: new Date(Date.parse(now) + index).toISOString() }).execute()
      return (await new Ticket(trx).findById(id))!
    })
  }

  async requireOpen(id: string, projectId?: string): Promise<Selectable<DB['ticket']>> {
    const row = await this.findById(id)
    if (!row || (projectId !== undefined && row.projectId !== projectId))
      throw new Error('工单不存在或不属于当前项目')
    if (row.status === 'done' || row.status === 'cancelled')
      throw new Error('工单已结束')
    return row
  }

  async reopen(id: string, updatedAt: string): Promise<boolean> {
    const result = await this.db
      .updateTable('ticket')
      .set({ status: 'waiting', endedAt: null, updatedAt })
      .where('id', '=', id)
      .where('status', 'in', ['done', 'cancelled'])
      .executeTakeFirst()
    return Number(result.numUpdatedRows ?? 0) > 0
  }

  async closeThread(threadId: string, outcome: 'merged' | 'closed', at: string, branch: string | null): Promise<string[]> {
    const thread = await this.db.selectFrom('thread').selectAll().where('id', '=', threadId).executeTakeFirst()
    if (!thread?.url || thread.kind !== 'pull')
      return []
    const ended: string[] = []
    for (const { ticketId } of await this.db.selectFrom('ticket_thread').select('ticketId').where('threadId', '=', threadId).orderBy('createdAt').execute()) {
      const row = await this.findById(ticketId)
      if (!row || CLOSED_STATUS.includes(row.status))
        continue
      const worker = await this.latestWorker(ticketId)
      const own = row.prUrl === thread.url || (!!branch && worker?.branch === branch)
      if (own)
        await this.setPullRequest(ticketId, thread.url, outcome, row.ciState)
      else if (row.prUrl || !(await this.onlyFollow(ticketId)))
        continue
      else await this.save(ticketId, { prState: outcome })
      if (await this.unfinished(ticketId, at, worker))
        continue
      const updatedAt = new Date().toISOString()
      await this.finish(ticketId, 'done', worker && Date.parse(worker.createdAt) > Date.parse(at) ? updatedAt : at, updatedAt)
      ended.push(ticketId)
    }
    return ended
  }

  private async latestWorker(ticketId: string): Promise<Selectable<DB['worker']> | undefined> {
    return this.db.selectFrom('worker').selectAll().where('ticketId', '=', ticketId).orderBy('createdAt', 'desc').orderBy('id', 'desc').executeTakeFirst()
  }

  private async onlyFollow(ticketId: string): Promise<boolean> {
    const pulls = await this.db.selectFrom('ticket_thread').innerJoin('thread', 'thread.id', 'ticket_thread.threadId').select('thread.id').where('ticket_thread.ticketId', '=', ticketId).where('thread.kind', '=', 'pull').execute()
    return pulls.length === 1
  }

  private async unfinished(ticketId: string, at: string, worker: Selectable<DB['worker']> | undefined): Promise<boolean> {
    if (!worker)
      return false
    if (await this.tookUpSince(ticketId, worker.reportAt ?? worker.createdAt))
      return true
    if (!(Date.parse(worker.createdAt) > Date.parse(at)))
      return false
    return !['ready', 'dropped'].includes(worker.reportState ?? '')
  }

  private async tookUpSince(ticketId: string, since: string): Promise<boolean> {
    return !!(await this.db
      .selectFrom('inbox')
      .select('id')
      .where('ticketId', '=', ticketId)
      .where('origin', '=', 'channel')
      .where('kind', '=', 'trigger')
      .where('status', '!=', 'done')
      .where('readAt', 'is not', null)
      .where('createdAt', '>', since)
      .executeTakeFirst())
  }

  async setPausedIfOpen(id: string, paused: boolean, updatedAt: string): Promise<Selectable<DB['ticket']> | undefined> {
    return this.db.updateTable('ticket').set({ paused: paused ? 1 : 0, updatedAt }).where('id', '=', id).where('status', 'not in', ['done', 'cancelled']).returningAll().executeTakeFirst()
  }
}
