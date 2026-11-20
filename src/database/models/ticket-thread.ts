import type { Kysely, Selectable } from 'kysely'
import type { DB } from '@/database/types'

export class TicketThread {
  private readonly db: Kysely<DB>

  constructor(db: Kysely<DB>) {
    this.db = db
  }

  async listByTicket(ticketId: string): Promise<Selectable<DB['ticket_thread']>[]> {
    return this.db
      .selectFrom('ticket_thread')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .orderBy('createdAt')
      .execute()
  }

  async listByThread(threadId: string): Promise<Selectable<DB['ticket_thread']>[]> {
    return this.db
      .selectFrom('ticket_thread')
      .selectAll()
      .where('threadId', '=', threadId)
      .orderBy('createdAt')
      .execute()
  }

  async listTicketIds(threadId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('ticket_thread')
      .select('ticketId')
      .where('threadId', '=', threadId)
      .orderBy('createdAt')
      .execute()
    return rows.map(row => row.ticketId)
  }

  async link(ticketId: string, threadId: string, createdAt: string): Promise<boolean> {
    const result = await this.db
      .insertInto('ticket_thread')
      .values({ ticketId, threadId, createdAt })
      .onConflict(oc => oc.columns(['ticketId', 'threadId']).doNothing())
      .executeTakeFirst()
    return Number(result.numInsertedOrUpdatedRows) > 0
  }

  async unlink(ticketId: string, threadId: string): Promise<void> {
    await this.db
      .deleteFrom('ticket_thread')
      .where('ticketId', '=', ticketId)
      .where('threadId', '=', threadId)
      .execute()
  }

  async listAll(): Promise<Selectable<DB['ticket_thread']>[]> {
    return this.db.selectFrom('ticket_thread').selectAll().orderBy('createdAt').execute()
  }
}
