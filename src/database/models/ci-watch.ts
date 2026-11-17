import type { Insertable, Kysely, Selectable } from 'kysely'
import type { DB } from '../types'
import { Model } from 'kysely-model'

export class CiWatch extends Model<DB, 'ci_watch'> {
  constructor(db: Kysely<DB>) {
    super(db, 'ci_watch', 'id')
  }

  async findTarget(channelId: string, kind: string, ref: string): Promise<Selectable<DB['ci_watch']> | undefined> {
    return this.db
      .selectFrom('ci_watch')
      .selectAll()
      .where('channelId', '=', channelId)
      .where('kind', '=', kind)
      .where('ref', '=', ref)
      .executeTakeFirst()
  }

  async listByChannel(channelId: string): Promise<Selectable<DB['ci_watch']>[]> {
    return this.db
      .selectFrom('ci_watch')
      .selectAll()
      .where('channelId', '=', channelId)
      .orderBy('ref')
      .execute()
  }

  async rotate(id: string, fingerprint: string, updatedAt: string, head: string | null = null): Promise<void> {
    await this.db
      .updateTable('ci_watch')
      .set(eb => ({ fingerprint, head, updatedAt, revision: eb('revision', '+', 1) }))
      .where('id', '=', id)
      .execute()
  }

  async recordRevision(value: Insertable<DB['ci_watch']>): Promise<{ row: Selectable<DB['ci_watch']>, changed: boolean }> {
    return this.db.transaction().execute(async (trx) => {
      const model = new CiWatch(trx)
      const previous = await model.findTarget(value.channelId, value.kind, value.ref)
      if (!previous) {
        await model.create({ ...value, revision: 0 })
        return { row: (await model.findTarget(value.channelId, value.kind, value.ref))!, changed: true }
      }
      const changed = previous.fingerprint !== value.fingerprint || previous.head !== (value.head ?? null)
      if (changed)
        await model.rotate(previous.id, value.fingerprint, value.updatedAt, value.head ?? null)
      return { row: (await model.findTarget(value.channelId, value.kind, value.ref))!, changed }
    })
  }
}
