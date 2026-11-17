import type { Kysely, Selectable } from 'kysely'
import type { DB } from '../types'
import { Model } from 'kysely-model'

export class Channel extends Model<DB, 'channel'> {
  constructor(db: Kysely<DB>) {
    super(db, 'channel', 'id')
  }

  async findEnabled(): Promise<Selectable<DB['channel']>[]> {
    return this.db
      .selectFrom('channel')
      .selectAll()
      .where('enabled', '=', 1)
      .orderBy('id')
      .execute()
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.db
      .updateTable('channel')
      .set({ enabled: enabled ? 1 : 0 })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['channel']> | undefined> {
    return this.db.selectFrom('channel').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listAll(): Promise<Selectable<DB['channel']>[]> {
    return this.db.selectFrom('channel').selectAll().orderBy('id').execute()
  }
}
