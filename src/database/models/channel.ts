import type { Kysely, Selectable } from 'kysely'
import type { DB } from '../types'
import { Model } from 'kysely-model'

export class Channel extends Model<DB, 'channel'> {
  constructor(db: Kysely<DB>) {
    super(db, 'channel', 'id')
  }

  async saveConfiguration(id: string, name: string, host: string | null, enabled: boolean, metadata: { commitName: string, commitEmail: string }, account?: { name: string, avatar: string | null }, hostChanged = false): Promise<void> {
    const now = new Date().toISOString()
    await this.db.transaction().execute(async (trx) => {
      const previous = await trx.selectFrom('channel').selectAll().where('id', '=', id).executeTakeFirst()
      const activation = await trx.selectFrom('source_state').select('name').where('channelId', '=', id).where('name', '=', 'activation').executeTakeFirst()
      await trx.insertInto('channel').values({ id, name, host, enabled: enabled ? 1 : 0, createdAt: now }).onConflict(oc => oc.column('id').doUpdateSet({ name, host, enabled: enabled ? 1 : 0 })).execute()
      if (enabled && (!previous?.enabled || hostChanged || !activation)) {
        const observedAt = previous?.enabled && !hostChanged ? previous.createdAt : now
        await trx.insertInto('source_state').values({ channelId: id, name: 'activation', value: JSON.stringify(observedAt), updatedAt: now }).onConflict(oc => oc.columns(['channelId', 'name']).doUpdateSet({ value: JSON.stringify(observedAt), updatedAt: now })).execute()
      }
      await trx.insertInto('source_state').values({ channelId: id, name: 'configuration', value: JSON.stringify(metadata), updatedAt: now }).onConflict(oc => oc.columns(['channelId', 'name']).doUpdateSet({ value: JSON.stringify(metadata), updatedAt: now })).execute()
      if (account) {
        await trx.deleteFrom('channel_account').where('channelId', '=', id).where('role', '=', 'bot').execute()
        await trx.insertInto('channel_account').values({ id: `${id}:bot`, channelId: id, role: 'bot', name: account.name, avatar: account.avatar, status: 'online', createdAt: now }).execute()
      }
    })
  }

  async removeCredentials(id: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('channel').set({ enabled: 0 }).where('id', '=', id).execute()
      await trx.deleteFrom('channel_account').where('channelId', '=', id).where('role', '=', 'bot').execute()
      await trx.updateTable('channel_account').set({ status: 'offline' }).where('channelId', '=', id).where('role', '=', 'admin').execute()
    })
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
