import type { DB } from '../src/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { H3 } from 'h3'
import { Kysely } from 'kysely'
import { Migrator } from 'kysely/migration'
import { createStorage } from 'unstorage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrations } from '../src/database/migrations'
import { Channel } from '../src/database/models/channel'
import { ChannelAccount } from '../src/database/models/channel-account'
import { Inbox } from '../src/database/models/inbox'
import { Project } from '../src/database/models/project'
import { Supervisor } from '../src/database/models/supervisor'
import { SupervisorTicket } from '../src/database/models/supervisor-ticket'
import { Thread } from '../src/database/models/thread'
import { Ticket } from '../src/database/models/ticket'
import { TicketLink } from '../src/database/models/ticket-link'
import { TicketThread } from '../src/database/models/ticket-thread'
import { Trigger } from '../src/database/models/trigger'
import { Worker } from '../src/database/models/worker'
import { MigrationProvider } from '../src/database/utils/migration'
import { authorize } from '../src/server'
import { postAnswer } from '../src/server/routes/asks.post'
import { getContext } from '../src/server/routes/context.get'
import { getMailbox } from '../src/server/routes/mailbox.get'
import { handleMail } from '../src/server/routes/mailbox.post'
import { getPanel } from '../src/server/routes/panel.get'
import { patchProject } from '../src/server/routes/projects.patch'
import { refreshProjects } from '../src/server/routes/projects.post'
import { patchSettings } from '../src/server/routes/settings.patch'
import { getTicket } from '../src/server/routes/tickets.get'
import { postTicket } from '../src/server/routes/tickets.post'

const boundary = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  storage: null as unknown as ReturnType<typeof import('unstorage').createStorage>,
  owner: vi.fn(),
  resolve: vi.fn(),
  view: vi.fn(),
  deliverAnswers: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('../src/database', () => ({ db: boundary.db }))
vi.mock('../src/storage', () => ({
  get storage() {
    return boundary.storage
  },
}))
vi.mock('../src/service/session', () => ({ session: { resolve: boundary.resolve, view: boundary.view } }))
vi.mock('../src/service/inbox', () => ({ inbox: { deliverAnswers: boundary.deliverAnswers } }))
vi.mock('../src/service/project', () => ({ project: { sync: boundary.sync } }))

const now = '2026-01-01T00:00:00.000Z'
let connection: Kysely<DB>
let app: H3
let models: ReturnType<typeof makeModels>
let ticketId: string

function makeModels(db: Kysely<DB>) {
  return {
    channel: new Channel(db),
    channelAccount: new ChannelAccount(db),
    project: new Project(db),
    inbox: new Inbox(db),
    supervisor: new Supervisor(db),
    supervisorTicket: new SupervisorTicket(db),
    thread: new Thread(db),
    ticket: new Ticket(db),
    ticketLink: new TicketLink(db),
    ticketThread: new TicketThread(db),
    trigger: new Trigger(db),
    worker: new Worker(db),
  }
}

async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.fetch(new Request(`http://nexus.test${path}`, {
    method,
    headers: { host: 'nexus.test', origin: 'http://nexus.test', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }))
}

beforeEach(async () => {
  vi.resetAllMocks()
  boundary.storage = createStorage()
  boundary.owner.mockResolvedValue(true)
  boundary.resolve.mockResolvedValue({ role: 'main' })
  boundary.deliverAnswers.mockResolvedValue(undefined)
  const sqlite = new DatabaseSync(':memory:')
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: sqlite }) })
  const { error } = await new Migrator({ db: connection, provider: new MigrationProvider(sqlite, migrations) }).migrateToLatest()
  if (error)
    throw error
  models = makeModels(connection)
  Object.assign(boundary.db, models)
  await models.channel.create({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: now })
  await models.project.create({ id: 'p1', name: 'Display name', remoteUrl: 'https://github.com/org/repo.git', enabled: 1, workspaceId: 'workspace-1', directory: '/isolated/project', orchestratorSessionId: null, createdAt: now, updatedAt: now })
  await models.thread.record({ id: 'thread-a', channelId: 'github', projectId: 'p1', refId: 'org/repo/issues/1', kind: 'issue', title: 'Real issue title', url: 'https://github.com/org/repo/issues/1', createdAt: now, updatedAt: now, triagedAt: null })
  ticketId = (await models.ticket.createWithThreads('p1', 'Real task title', ['thread-a'], 'Real requirement')).id
  app = new H3()
  app.use((event) => {
    event.context.__host_instance = { context: {}, options: { owner: boundary.owner, origin: 'http://nexus.test' } }
  })
  app.use(authorize)
  app.get('/api/nexus/panel', getPanel)
  app.get('/api/nexus/tickets/:id', getTicket)
  app.post('/api/nexus/tickets/:id/:action', postTicket)
  app.patch('/api/nexus/projects/:id', patchProject)
  app.post('/api/nexus/projects/refresh', refreshProjects)
  app.patch('/api/nexus/settings', patchSettings)
  app.post('/api/nexus/asks/:id/answers', postAnswer)
  app.get('/api/nexus/sessions/:id/context', getContext)
  app.get('/api/nexus/sessions/:id/mailbox', getMailbox)
  app.post('/api/nexus/sessions/:id/mailbox/:messageId/handled', handleMail)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await connection.destroy()
  await boundary.storage.dispose()
})

describe('native h3 route authorization', () => {
  it('rejects non-owner before settings can be written', async () => {
    boundary.owner.mockResolvedValue(false)
    const response = await request('/api/nexus/settings', 'PATCH', { maxWorkers: 8 })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ message: 'owner_required' })
    expect(await boundary.storage.getItem('setting')).toBeNull()
  })

  it.each([{ origin: 'https://other.test', host: 'nexus.test' }, { origin: 'http://nexus.test', host: 'other.test' }])('rejects untrusted origin or host before invoking owner admission: %j', async (headers) => {
    const response = await request('/api/nexus/settings', 'PATCH', { maxWorkers: 8 }, headers)
    expect(response.status).toBe(403)
    expect(boundary.owner).not.toHaveBeenCalled()
    expect(await boundary.storage.getItem('setting')).toBeNull()
  })
})

describe('settings request contract', () => {
  it.each([null, [], {}, { maxWorkers: 0 }, { maxWorkers: 17 }, { maxWorkers: '2' }, { maxWorkers: 1.5 }, { autoMerge: 1 }, { autoMergeMaxLines: 0 }, { deliveryMaxAttempts: 21 }, { deliveryRetryCeilingSeconds: 1 }, { backgroundLimitMinutes: 1441 }, { whitelist: ['owner'] }, { maxWorkers: 2, injected: true }])('rejects invalid settings atomically: %j', async (body) => {
    const response = await request('/api/nexus/settings', 'PATCH', body)
    expect(response.status).toBe(400)
    expect(await boundary.storage.getItem('setting')).toBeNull()
  })

  it('persists valid partial settings and serializes the merge flag as a boolean', async () => {
    const response = await request('/api/nexus/settings', 'PATCH', { maxWorkers: 16, autoMerge: true, deliveryRetryCeilingSeconds: 3600 })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ maxWorkers: 16, autoMerge: true, deliveryRetryCeilingSeconds: 3600 })
    expect(await boundary.storage.getItem('setting')).toMatchObject({ maxWorkers: 16, autoMerge: true, deliveryRetryCeilingSeconds: 3600 })
  })
})

describe('panel and ticket projections', () => {
  it('keeps an old unanswered question visible after more than 100 newer messages', async () => {
    await models.inbox.enqueue({ id: 'older-ask', type: 'user', origin: 'main', kind: 'ask', message: 'Still waiting', createdAt: '2000-01-01T00:00:00.000Z' })
    for (let index = 0; index < 101; index++)
      await models.inbox.enqueue({ id: `recent-${index}`, type: 'main', origin: 'project', kind: 'notice', message: 'A later message', createdAt: now })
    const response = await request('/api/nexus/panel')
    expect(response.status).toBe(200)
    const panel = await response.json()
    expect(panel.inbox.pending.map((row: { id: string }) => row.id)).toEqual(['older-ask'])
  })

  it('returns real graph links, channel accounts and only user-addressed pending inbox entries', async () => {
    await models.channelAccount.create({ id: 'bot', channelId: 'github', role: 'bot', name: 'nexus', avatar: null, status: 'online', createdAt: now })
    await models.inbox.enqueue({ id: 'user-ask', type: 'user', origin: 'main', kind: 'ask', message: 'Need a decision', ticketId })
    await models.inbox.enqueue({ id: 'private', type: 'project', origin: 'main', kind: 'notice', message: 'For project', projectId: 'p1', ticketId })
    const response = await request('/api/nexus/panel')
    expect(response.status).toBe(200)
    const panel = await response.json()
    expect(panel.tickets).toMatchObject([{ id: ticketId, title: 'Real task title' }])
    expect(panel.graph.edges).toContainEqual({ source: 'project:p1', target: `ticket:${ticketId}`, kind: 'flow' })
    expect(panel.inbox.pending.map((row: { id: string }) => row.id)).toEqual(['user-ask'])
    expect(panel.channels).toMatchObject([{ id: 'github', enabled: true, accounts: [{ id: 'bot', status: 'online' }] }])
  })

  it('returns linked topics and inbox for an existing ticket and rejects a missing ticket', async () => {
    const response = await request(`/api/nexus/tickets/${ticketId}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ticket: { id: ticketId, description: 'Real requirement' }, project: { id: 'p1' }, topics: [{ id: 'thread-a' }], subscriptions: [{ ticketId, threadId: 'thread-a' }] })
    expect((await request('/api/nexus/tickets/missing')).status).toBe(404)
  })

  it('pauses and resumes an open ticket but rejects a closed ticket and unknown commands', async () => {
    expect((await request(`/api/nexus/tickets/${ticketId}/pause`, 'POST', { reason: 'Inspect result' })).status).toBe(200)
    expect(await models.ticket.findById(ticketId)).toMatchObject({ paused: 1, status: 'waiting' })
    expect((await request(`/api/nexus/tickets/${ticketId}/resume`, 'POST', { reason: 'Continue' })).status).toBe(200)
    expect(await models.ticket.findById(ticketId)).toMatchObject({ paused: 0 })
    await models.ticket.finish(ticketId, 'done', now, now)
    expect((await request(`/api/nexus/tickets/${ticketId}/pause`, 'POST', { reason: 'Too late' })).status).toBe(409)
    expect((await request(`/api/nexus/tickets/${ticketId}/cancel`, 'POST', { reason: 'Unsupported' })).status).toBe(404)
  })
})

describe('project requests', () => {
  it('rejects enabling a project without verified remote identity', async () => {
    await models.project.update('p1', { enabled: 0, remoteUrl: null })
    expect((await request('/api/nexus/projects/p1', 'PATCH', { enabled: true })).status).toBe(409)
    expect(await models.project.findById('p1')).toMatchObject({ enabled: 0, remoteUrl: null })
  })

  it('persists a boolean project switch and rejects injected fields', async () => {
    expect((await request('/api/nexus/projects/p1', 'PATCH', { enabled: false })).status).toBe(200)
    expect(await models.project.findById('p1')).toMatchObject({ enabled: 0 })
    expect((await request('/api/nexus/projects/p1', 'PATCH', { enabled: true, remoteUrl: 'https://other.test' })).status).toBe(400)
    expect(await models.project.findById('p1')).toMatchObject({ enabled: 0 })
  })
})

describe('human answers and session mailboxes', () => {
  it('answers a user ask exactly once and requests reliable delivery', async () => {
    await models.inbox.enqueue({ id: 'ask', type: 'user', origin: 'main', kind: 'ask', message: 'Proceed?', ticketId })
    const response = await request('/api/nexus/asks/ask/answers', 'POST', { answer: 'Proceed' })
    expect(response.status).toBe(200)
    expect(await models.inbox.findById('ask')).toMatchObject({ status: 'done', answer: 'Proceed', answeredBy: 'user' })
    expect(boundary.deliverAnswers).toHaveBeenCalledTimes(1)
    expect((await request('/api/nexus/asks/ask/answers', 'POST', { answer: 'Different' })).status).toBe(409)
    expect(await models.inbox.findById('ask')).toMatchObject({ answer: 'Proceed' })
    expect(boundary.deliverAnswers).toHaveBeenCalledTimes(1)
  })

  it('rejects answers for agent-addressed asks and empty answers without changing their state', async () => {
    await models.inbox.enqueue({ id: 'private-ask', type: 'project', origin: 'worker', kind: 'ask', message: 'Need help', projectId: 'p1', ticketId })
    expect((await request('/api/nexus/asks/private-ask/answers', 'POST', { answer: 'No' })).status).toBe(403)
    expect((await request('/api/nexus/asks/private-ask/answers', 'POST', { answer: '  ' })).status).toBe(400)
    expect(await models.inbox.findById('private-ask')).toMatchObject({ status: 'pending', answer: null })
    expect(boundary.deliverAnswers).not.toHaveBeenCalled()
  })

  it('scopes a project mailbox by resolved session identity and rejects cross-scope handling', async () => {
    boundary.resolve.mockResolvedValue({ role: 'project', projectId: 'p1' })
    await models.inbox.enqueue({ id: 'own', type: 'project', origin: 'main', kind: 'notice', message: 'Own mail', projectId: 'p1' })
    await models.inbox.enqueue({ id: 'other', type: 'main', origin: 'system', kind: 'notice', message: 'Main mail' })
    const response = await request('/api/nexus/sessions/manager/mailbox')
    expect(await response.json()).toMatchObject({ pendingCount: 1, messages: [{ id: 'own' }] })
    expect((await request('/api/nexus/sessions/manager/mailbox/other/handled', 'POST')).status).toBe(403)
    expect(await models.inbox.findById('other')).toMatchObject({ status: 'pending' })
    expect((await request('/api/nexus/sessions/manager/mailbox/own/handled', 'POST')).status).toBe(200)
    expect(await models.inbox.findById('own')).toMatchObject({ status: 'done' })
  })

  it('rejects mailbox access by a worker and preserves unresolved asks when marking handled', async () => {
    boundary.resolve.mockResolvedValue({ role: 'worker', workerId: 'worker', ticketId })
    expect((await request('/api/nexus/sessions/worker/mailbox')).status).toBe(409)
    boundary.resolve.mockResolvedValue({ role: 'main' })
    await models.inbox.enqueue({ id: 'question', type: 'main', origin: 'project', kind: 'ask', message: 'Decision?', projectId: 'p1' })
    expect((await request('/api/nexus/sessions/main/mailbox/question/handled', 'POST')).status).toBe(409)
    expect(await models.inbox.findById('question')).toMatchObject({ status: 'pending', answer: null })
  })

  it('rejects an unknown session before loading its context', async () => {
    boundary.resolve.mockResolvedValue(null)
    expect((await request('/api/nexus/sessions/missing/context')).status).toBe(404)
    expect(boundary.view).not.toHaveBeenCalled()
  })
})
