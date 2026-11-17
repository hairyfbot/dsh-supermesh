import type { Kysely, Selectable } from 'kysely'
import type { DB } from '../types'

export class SupervisorTicket {
  private readonly db: Kysely<DB>

  constructor(db: Kysely<DB>) {
    this.db = db
  }

  async listBySupervisor(supervisorId: string): Promise<Selectable<DB['supervisor_ticket']>[]> {
    return this.db
      .selectFrom('supervisor_ticket')
      .selectAll()
      .where('supervisorId', '=', supervisorId)
      .orderBy('createdAt')
      .execute()
  }

  async listByTicket(ticketId: string): Promise<Selectable<DB['supervisor_ticket']>[]> {
    return this.db
      .selectFrom('supervisor_ticket')
      .selectAll()
      .where('ticketId', '=', ticketId)
      .execute()
  }

  async link(supervisorId: string, ticketId: string, createdAt: string): Promise<void> {
    await this.db
      .insertInto('supervisor_ticket')
      .values({ supervisorId, ticketId, createdAt })
      .onConflict(oc => oc.columns(['supervisorId', 'ticketId']).doNothing())
      .execute()
  }

  async unlink(supervisorId: string, ticketId: string): Promise<void> {
    await this.db
      .deleteFrom('supervisor_ticket')
      .where('supervisorId', '=', supervisorId)
      .where('ticketId', '=', ticketId)
      .execute()
  }

  async listAll(): Promise<Selectable<DB['supervisor_ticket']>[]> {
    return this.db.selectFrom('supervisor_ticket').selectAll().orderBy('createdAt').execute()
  }
}
