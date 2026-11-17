import type { Kysely, Selectable } from 'kysely'
import type { AccountRole, AccountStatus, DB } from '../types'
import { Model } from 'kysely-model'

export class ChannelAccount extends Model<DB, 'channel_account'> {
  constructor(db: Kysely<DB>) {
    super(db, 'channel_account', 'id')
  }

  async findByChannel(channelId: string): Promise<Selectable<DB['channel_account']>[]> {
    return this.db
      .selectFrom('channel_account')
      .selectAll()
      .where('channelId', '=', channelId)
      .orderBy('role')
      .orderBy('name')
      .execute()
  }

  async findByRole(channelId: string, role: AccountRole): Promise<Selectable<DB['channel_account']>[]> {
    return this.db
      .selectFrom('channel_account')
      .selectAll()
      .where('channelId', '=', channelId)
      .where('role', '=', role)
      .orderBy('name')
      .execute()
  }

  async findByName(channelId: string, role: AccountRole, name: string): Promise<Selectable<DB['channel_account']> | undefined> {
    return this.db
      .selectFrom('channel_account')
      .selectAll()
      .where('channelId', '=', channelId)
      .where('role', '=', role)
      .where('name', '=', name)
      .executeTakeFirst()
  }

  async setStatus(id: string, status: AccountStatus): Promise<void> {
    await this.db
      .updateTable('channel_account')
      .set({ status })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['channel_account']> | undefined> {
    return this.db.selectFrom('channel_account').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listAll(): Promise<Selectable<DB['channel_account']>[]> {
    return this.db.selectFrom('channel_account').selectAll().orderBy('id').execute()
  }
}
