import type { DB } from '@/database/types'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { Migrator } from 'kysely/migration'
import { DSH_PLUGIN_HOME } from '@/config/paths'
import { migrations } from '@/database/migrations'
import { Channel } from '@/database/models/channel'
import { ChannelAccount } from '@/database/models/channel-account'
import { CiWatch } from '@/database/models/ci-watch'
import { Inbox } from '@/database/models/inbox'
import { Project } from '@/database/models/project'
import { SourceState } from '@/database/models/source-state'
import { Supervisor } from '@/database/models/supervisor'
import { SupervisorTicket } from '@/database/models/supervisor-ticket'
import { Thread } from '@/database/models/thread'
import { Ticket } from '@/database/models/ticket'
import { TicketLink } from '@/database/models/ticket-link'
import { TicketThread } from '@/database/models/ticket-thread'
import { Trigger } from '@/database/models/trigger'
import { Worker } from '@/database/models/worker'
import { MigrationProvider } from '@/database/utils/migration'

const worker = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID
const name = worker ? `data.worker-${worker}.db` : 'data.db'
// 桌面版宿主的工作目录是应用依赖目录，应用一更新整目录会被替换，库跟着一起没了；
// 生产库必须放在插件自己的目录。测试留在工作目录，不碰用户数据。
const file = worker ? name : join(DSH_PLUGIN_HOME, name)
if (!worker) {
  mkdirSync(DSH_PLUGIN_HOME, { recursive: true })
  const legacy = join(process.cwd(), name)
  if (!existsSync(file) && existsSync(legacy))
    copyFileSync(legacy, file)
}
const database = new DatabaseSync(file)

const connection = new Kysely<DB>({
  dialect: new NodeSqliteDialect({ database }),
})

export const db = Object.assign(connection, {
  channel: new Channel(connection),
  channelAccount: new ChannelAccount(connection),
  ciWatch: new CiWatch(connection),
  inbox: new Inbox(connection),
  project: new Project(connection),
  sourceState: new SourceState(connection),
  supervisor: new Supervisor(connection),
  supervisorTicket: new SupervisorTicket(connection),
  thread: new Thread(connection),
  ticket: new Ticket(connection),
  ticketLink: new TicketLink(connection),
  ticketThread: new TicketThread(connection),
  trigger: new Trigger(connection),
  worker: new Worker(connection),
})

const migrator = new Migrator({
  db,
  provider: new MigrationProvider(database, migrations),
})
const { error } = await migrator.migrateToLatest()
if (error)
  throw error
