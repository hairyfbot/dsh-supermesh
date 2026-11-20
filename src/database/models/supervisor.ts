import type { Kysely, Selectable } from 'kysely'
import type { DB, SupervisorStatus } from '@/database/types'
import { Model } from 'kysely-model'

export class Supervisor extends Model<DB, 'supervisor'> {
  constructor(db: Kysely<DB>) {
    super(db, 'supervisor', 'id')
  }

  async listActive(): Promise<Selectable<DB['supervisor']>[]> {
    return this.db
      .selectFrom('supervisor')
      .selectAll()
      .where('status', '=', 'active')
      .orderBy('createdAt')
      .execute()
  }

  async listByStatus(status: SupervisorStatus): Promise<Selectable<DB['supervisor']>[]> {
    return this.db
      .selectFrom('supervisor')
      .selectAll()
      .where('status', '=', status)
      .orderBy('createdAt')
      .execute()
  }

  async attachSession(id: string, sessionId: string | null): Promise<void> {
    await this.db
      .updateTable('supervisor')
      .set({ sessionId })
      .where('id', '=', id)
      .execute()
  }

  async close(id: string, closedAt: string): Promise<void> {
    await this.db
      .updateTable('supervisor')
      .set({ status: 'closed', closedAt })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['supervisor']> | undefined> {
    return this.db.selectFrom('supervisor').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async findBySession(sessionId: string): Promise<Selectable<DB['supervisor']> | undefined> {
    const rows = await this.db.selectFrom('supervisor').selectAll().where('sessionId', '=', sessionId).limit(2).execute()
    if (rows.length > 1)
      throw new Error('session_binding_conflict')
    return rows[0]
  }
}
