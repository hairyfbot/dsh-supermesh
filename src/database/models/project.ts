import type { Kysely, Selectable } from 'kysely'
import type { DB } from '../types'
import { Model } from 'kysely-model'

export class Project extends Model<DB, 'project'> {
  constructor(db: Kysely<DB>) {
    super(db, 'project', 'id')
  }

  async findByWorkspace(workspaceId: string): Promise<Selectable<DB['project']> | undefined> {
    return this.db
      .selectFrom('project')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst()
  }

  async setOrchestrator(id: string, orchestratorSessionId: string | null, updatedAt: string): Promise<void> {
    await this.db
      .updateTable('project')
      .set({ orchestratorSessionId, updatedAt })
      .where('id', '=', id)
      .execute()
  }

  async findById(id: string): Promise<Selectable<DB['project']> | undefined> {
    return this.db.selectFrom('project').selectAll().where('id', '=', id).executeTakeFirst()
  }

  async listAll(): Promise<Selectable<DB['project']>[]> {
    return this.db.selectFrom('project').selectAll().orderBy('id').execute()
  }

  async findBySession(sessionId: string): Promise<Selectable<DB['project']> | undefined> {
    const rows = await this.db.selectFrom('project').selectAll().where('orchestratorSessionId', '=', sessionId).limit(2).execute()
    if (rows.length > 1)
      throw new Error('session_binding_conflict')
    return rows[0]
  }

  async findByRemote(remoteUrl: string): Promise<Selectable<DB['project']> | undefined> {
    return this.db.selectFrom('project').selectAll().where('remoteUrl', '=', remoteUrl).executeTakeFirst()
  }

  async setEnabled(id: string, enabled: boolean, updatedAt: string): Promise<Selectable<DB['project']> | undefined> {
    let query = this.db.updateTable('project').set({ enabled: enabled ? 1 : 0, updatedAt }).where('id', '=', id)
    if (enabled)
      query = query.where('remoteUrl', 'is not', null).where('remoteUrl', '!=', '')
    return query.returningAll().executeTakeFirst()
  }

  async upsertWorkspace(value: Pick<DB['project'], 'id' | 'workspaceId' | 'name' | 'directory' | 'remoteUrl'>, updatedAt: string): Promise<Selectable<DB['project']>> {
    return this.db.insertInto('project').values({ ...value, enabled: value.remoteUrl?.trim() ? 1 : 0, orchestratorSessionId: null, createdAt: updatedAt, updatedAt }).onConflict(oc => oc.column('workspaceId').doUpdateSet({ name: value.name, directory: value.directory, remoteUrl: value.remoteUrl, updatedAt })).returningAll().executeTakeFirstOrThrow()
  }
}
