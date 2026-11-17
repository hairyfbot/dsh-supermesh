import type { Insertable, Kysely, Selectable } from 'kysely'
import type { DB } from '../types'
import { Model } from 'kysely-model'

export class Trigger extends Model<DB, 'trigger'> {
  constructor(db: Kysely<DB>) {
    super(db, 'trigger', 'id')
  }

  async listByThread(threadId: string, limit = 50): Promise<Selectable<DB['trigger']>[]> {
    return this.db
      .selectFrom('trigger')
      .selectAll()
      .where('threadId', '=', threadId)
      .orderBy('at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute()
  }

  async lastByThread(threadId: string): Promise<Selectable<DB['trigger']> | undefined> {
    return this.db
      .selectFrom('trigger')
      .selectAll()
      .where('threadId', '=', threadId)
      .orderBy('at', 'desc')
      .orderBy('id', 'desc')
      .executeTakeFirst()
  }

  async listByChannelSince(channelId: string, since: string): Promise<Selectable<DB['trigger']>[]> {
    return this.db
      .selectFrom('trigger')
      .selectAll()
      .where('channelId', '=', channelId)
      .where('at', '>', since)
      .orderBy('at')
      .execute()
  }

  async listByRef(channelId: string, ref: string): Promise<Selectable<DB['trigger']>[]> {
    return this.db
      .selectFrom('trigger')
      .selectAll()
      .where('channelId', '=', channelId)
      .where('ref', '=', ref)
      .orderBy('at', 'desc')
      .execute()
  }

  async exists(id: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('trigger')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst()
    return row !== undefined
  }

  async findById(id: string): Promise<Selectable<DB['trigger']> | undefined> {
    return this.db.selectFrom('trigger').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listRecent(limit = 100): Promise<Selectable<DB['trigger']>[]> {
    return this.db.selectFrom('trigger').selectAll().orderBy('at', 'desc').orderBy('id').limit(Math.max(1, Math.min(1000, limit))).execute()
  }

  async ingest(value: Insertable<DB['trigger']>): Promise<Selectable<DB['trigger']>> {
    await this.db.insertInto('trigger').values(value).onConflict(oc => oc.column('id').doNothing()).execute()
    return (await this.findById(value.id))!
  }
}
