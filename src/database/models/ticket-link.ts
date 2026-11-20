import type { Kysely, Selectable } from 'kysely'
import type { DB, TicketLinkKind } from '@/database/types'

export class TicketLink {
  private readonly db: Kysely<DB>

  constructor(db: Kysely<DB>) {
    this.db = db
  }

  async listByTicket(ticketId: string): Promise<Selectable<DB['ticket_link']>[]> {
    return this.db
      .selectFrom('ticket_link')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .orderBy('kind')
      .orderBy('relatedId')
      .execute()
  }

  async listByRelated(relatedId: string): Promise<Selectable<DB['ticket_link']>[]> {
    return this.db
      .selectFrom('ticket_link')
      .selectAll()
      .where('relatedId', '=', relatedId)
      .orderBy('kind')
      .orderBy('ticketId')
      .execute()
  }

  async listDependsOn(ticketId: string): Promise<Selectable<DB['ticket_link']>[]> {
    return this.db
      .selectFrom('ticket_link')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .where('kind', '=', 'depends')
      .execute()
  }

  async listDependents(relatedId: string): Promise<Selectable<DB['ticket_link']>[]> {
    return this.db
      .selectFrom('ticket_link')
      .selectAll()
      .where('relatedId', '=', relatedId)
      .where('kind', '=', 'depends')
      .execute()
  }

  async link(ticketId: string, relatedId: string, kind: TicketLinkKind, createdAt: string): Promise<void> {
    await this.db
      .insertInto('ticket_link')
      .values({ ticketId, relatedId, kind, createdAt })
      .onConflict(oc => oc.columns(['ticketId', 'relatedId', 'kind']).doNothing())
      .execute()
  }

  async unlink(ticketId: string, relatedId: string, kind: TicketLinkKind): Promise<void> {
    await this.db
      .deleteFrom('ticket_link')
      .where('ticketId', '=', ticketId)
      .where('relatedId', '=', relatedId)
      .where('kind', '=', kind)
      .execute()
  }

  async listAll(): Promise<Selectable<DB['ticket_link']>[]> {
    return this.db.selectFrom('ticket_link').selectAll().orderBy('createdAt').execute()
  }
}
