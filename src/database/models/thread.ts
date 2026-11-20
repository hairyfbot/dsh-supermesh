import type { Insertable, Kysely, Selectable } from 'kysely'
import type { DB } from '@/database/types'
import { Model } from 'kysely-model'

export class Thread extends Model<DB, 'thread'> {
  constructor(db: Kysely<DB>) {
    super(db, 'thread', 'id')
  }

  async findByRef(channelId: string, refId: string): Promise<Selectable<DB['thread']> | undefined> {
    return this.db
      .selectFrom('thread')
      .selectAll()
      .where('channelId', '=', channelId)
      .where('refId', '=', refId)
      .executeTakeFirst()
  }

  async listRecent(limit = 50): Promise<Selectable<DB['thread']>[]> {
    return this.db
      .selectFrom('thread')
      .selectAll()
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .execute()
  }

  async touch(id: string, updatedAt: string): Promise<void> {
    await this.db
      .updateTable('thread')
      .set({ updatedAt })
      .where('id', '=', id)
      .execute()
  }

  async claim(id: string, projectId: string, triagedAt: string): Promise<void> {
    await this.db
      .updateTable('thread')
      .set({ projectId, triage: 'claimed', triagedAt })
      .where('id', '=', id)
      .execute()
  }

  async ignore(id: string, triagedAt: string): Promise<void> {
    await this.db
      .updateTable('thread')
      .set({ triage: 'ignored', triagedAt })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['thread']> | undefined> {
    return this.db.selectFrom('thread').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async record(value: Insertable<DB['thread']>): Promise<Selectable<DB['thread']>> {
    await this.db.insertInto('thread').values(value).onConflict(oc => oc.column('id').doUpdateSet({ title: value.title, url: value.url, updatedAt: value.updatedAt })).execute()
    return (await this.findById(value.id))!
  }

  async listByChannel(channelId: string): Promise<Selectable<DB['thread']>[]> {
    return this.db.selectFrom('thread').selectAll().where('channelId', '=', channelId).orderBy('id').execute()
  }
}
