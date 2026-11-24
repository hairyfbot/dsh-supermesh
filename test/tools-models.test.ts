import type { DB } from '@/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrations } from '@/database/migrations'
import { Channel } from '@/database/models/channel'
import { CiWatch } from '@/database/models/ci-watch'
import { Inbox } from '@/database/models/inbox'
import { Project } from '@/database/models/project'
import { Supervisor } from '@/database/models/supervisor'
import { SupervisorTicket } from '@/database/models/supervisor-ticket'
import { Thread } from '@/database/models/thread'
import { Ticket } from '@/database/models/ticket'
import { TicketLink } from '@/database/models/ticket-link'
import { TicketThread } from '@/database/models/ticket-thread'
import { Trigger } from '@/database/models/trigger'
import { Worker } from '@/database/models/worker'

const now = '2026-01-01T00:00:00.000Z'
let sqlite: DatabaseSync
let connection: Kysely<DB>
let models: ReturnType<typeof makeModels>
let ticketId: string

function makeModels(db: Kysely<DB>) {
  return { channel: new Channel(db), project: new Project(db), inbox: new Inbox(db), ticket: new Ticket(db), ticketThread: new TicketThread(db), ticketLink: new TicketLink(db), supervisor: new Supervisor(db), supervisorTicket: new SupervisorTicket(db), thread: new Thread(db), trigger: new Trigger(db), worker: new Worker(db) }
}

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  for (const [, migration] of Object.entries(migrations).sort(([left], [right]) => left.localeCompare(right))) sqlite.exec(migration)
  sqlite.exec('PRAGMA foreign_keys = ON')
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: sqlite }) })
  models = makeModels(connection)
  await models.channel.create({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: now })
  for (const id of ['p1', 'p2']) await models.project.create({ id, name: id, remoteUrl: `https://github.com/org/${id}.git`, enabled: 1, workspaceId: `workspace-${id}`, directory: `/isolated/${id}`, orchestratorSessionId: `manager-${id}`, createdAt: now, updatedAt: now })
  for (const [id, projectId, number] of [['thread-1', 'p1', '1'], ['thread-2', 'p2', '2'], ['thread-3', 'p1', '3']]) await models.thread.record({ id, channelId: 'github', projectId, refId: number, kind: 'issue', title: id, url: `https://github.com/org/${projectId}/issues/${number}`, createdAt: now, updatedAt: now, triagedAt: null })
  ticketId = (await models.ticket.createWithThreads('p1', 'Fix parser', ['thread-1'])).id
})

afterEach(async () => {
  await connection.destroy()
})

describe('ticket and worker transactions', () => {
  it('ticket creation rejects a concurrent duplicate source without creating another ticket', async () => {
    const attempts = await Promise.allSettled([models.ticket.createWithThreads('p1', 'First', ['thread-3']), models.ticket.createWithThreads('p1', 'Second', ['thread-3'])])
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await models.ticketThread.listByThread('thread-3')).toHaveLength(1)
    expect(await models.ticket.listRecent()).toHaveLength(2)
  })

  it('ticket creation with an unknown source rolls back all ticket and subscription writes', async () => {
    await expect(models.ticket.createWithThreads('p1', 'Invalid', ['thread-3', 'missing'])).rejects.toThrow('来源话题不存在')
    expect(await models.ticket.listRecent()).toHaveLength(1)
    expect(await models.ticketThread.listByThread('thread-3')).toEqual([])
  })

  it('worker queue reserves one worker for concurrent calls and rejects other project access', async () => {
    const [first, second] = await Promise.all([models.worker.queue(ticketId, 'p1'), models.worker.queue(ticketId, 'p1')])
    expect(first.id).toBe(second.id)
    expect(first).toMatchObject({ status: 'queued', branch: null, worktree: null })
    expect(await models.worker.listByTicket(ticketId)).toHaveLength(1)
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'queued' })
    await expect(models.worker.queue(ticketId, 'p2')).rejects.toThrow('不属于当前项目')
    // 分支名不再要求末段是任务号，只用 ASCII；已排队的 worker 原样复用。
    await expect(models.worker.queue(ticketId, 'p1', 'dsh/custom-name')).resolves.toMatchObject({ ticketId })
    await expect(models.worker.queue(ticketId, 'p1', 'dsh/中文分支')).rejects.toThrow('分支名只能是 ASCII')
  })

  it('worker report records facts without writing the project inbox', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    await models.worker.reportProgress(worker.id, 'failed', 'Compiler failed')
    expect(await models.worker.findById(worker.id)).toMatchObject({ reportState: 'failed', report: 'Compiler failed' })
    expect(await models.inbox.listByTicket(ticketId)).toEqual([])
    await models.ticket.finish(ticketId, 'done', now, now)
    await expect(models.worker.reportProgress(worker.id, 'progress', 'Too late')).rejects.toThrow('工单已结束')
  })
})

describe('inbox ownership and ask lifecycle', () => {
  it('batch completion refuses mixed ownership without partially completing own messages', async () => {
    const own = await models.inbox.enqueue({ type: 'project', projectId: 'p1', origin: 'main', kind: 'notice', message: 'Own' })
    const other = await models.inbox.enqueue({ type: 'project', projectId: 'p2', origin: 'main', kind: 'notice', message: 'Other' })
    await expect(models.inbox.completeScoped([own.id, other.id], { type: 'project', projectId: 'p1' }, now)).rejects.toThrow('不属于当前身份')
    expect(await models.inbox.findById(own.id)).toMatchObject({ status: 'pending', doneAt: null })
    expect(await models.inbox.completeScoped([own.id, own.id], { type: 'project', projectId: 'p1' }, now)).toBe(1)
    expect(await models.inbox.findById(other.id)).toMatchObject({ status: 'pending' })
  })

  it('escalation retains one question identity and blocks the previous recipient from answering', async () => {
    await models.supervisor.create({ id: 's1', sessionId: 's-session', title: 'Coordinate', reason: 'Across repos', createdAt: now, closedAt: null })
    await models.supervisorTicket.link('s1', ticketId, now)
    const worker = await models.worker.queue(ticketId, 'p1')
    const ask = await models.inbox.enqueue({ type: 'project', projectId: 'p1', origin: 'worker', workerId: worker.id, ticketId, kind: 'ask', message: 'Which API?' })
    expect(await models.inbox.escalateScoped(ask.id, { type: 'project', projectId: 'p1' }, now)).toMatchObject({ id: ask.id, type: 'supervisor', supervisorId: 's1', escalations: 1, message: 'Which API?', status: 'pending' })
    await expect(models.inbox.answerScoped(ask.id, 'Wrong role', { type: 'project', projectId: 'p1' }, now)).rejects.toThrow('只能回答')
    expect(await models.inbox.escalateScoped(ask.id, { type: 'supervisor', supervisorId: 's1' }, now)).toMatchObject({ id: ask.id, type: 'main', escalations: 2, workerId: worker.id, origin: 'worker' })
    await models.inbox.answerScoped(ask.id, 'Use v2', { type: 'main' }, now)
    expect(await models.inbox.findById(ask.id)).toMatchObject({ status: 'done', answer: 'Use v2', answeredBy: 'main', doneAt: now })
    expect(await models.inbox.listByTicket(ticketId)).toHaveLength(1)
  })

  it('concurrent answers settle a pending ask once and human answers cannot claim project asks', async () => {
    const ask = await models.inbox.enqueue({ type: 'project', projectId: 'p1', origin: 'worker', kind: 'ask', message: 'Need approval' })
    expect(await models.inbox.answerByUser(ask.id, 'Unauthorized', now)).toBeUndefined()
    const answers = await Promise.allSettled([models.inbox.answerScoped(ask.id, 'A', { type: 'project', projectId: 'p1' }, now), models.inbox.answerScoped(ask.id, 'B', { type: 'project', projectId: 'p1' }, now)])
    expect(answers.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(answers.filter(result => result.status === 'rejected')).toHaveLength(1)
    const userAsk = await models.inbox.enqueue({ type: 'user', origin: 'main', kind: 'ask', message: 'Proceed?' })
    expect(await models.inbox.answerByUser(userAsk.id, 'Yes', now)).toMatchObject({ status: 'done', answer: 'Yes', answeredBy: 'user' })
    expect(await models.inbox.answerByUser(userAsk.id, 'No', now)).toBeUndefined()
  })

  it('stable inbox identifiers preserve original contents and allocate ordered unique sequences', async () => {
    const [first, second] = await Promise.all([models.inbox.enqueue({ id: 'stable', type: 'main', origin: 'system', kind: 'notice', message: 'Original' }), models.inbox.enqueue({ id: 'stable', type: 'main', origin: 'system', kind: 'notice', message: 'Replacement' })])
    expect(first).toEqual(second)
    expect(first.message).toBe('Original')
    const next = await models.inbox.enqueue({ type: 'main', origin: 'system', kind: 'notice', message: 'Next' })
    expect(next.seq).toBe(first.seq + 1)
  })
})

describe('queue and project boundary regressions', () => {
  it('concurrent identical work line questions create one pending ask and reject a different question', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    const value = { type: 'project' as const, projectId: 'p1', origin: 'worker' as const, workerId: worker.id, ticketId, message: 'Which API?' }
    const [first, second] = await Promise.all([models.inbox.enqueueAsk(value), models.inbox.enqueueAsk(value)])
    expect(first.id).toBe(second.id)
    expect(await models.inbox.listByTicket(ticketId)).toHaveLength(1)
    await expect(models.inbox.enqueueAsk({ ...value, message: 'Different question' })).rejects.toThrow('已有 pending ask')
    const [mainFirst, mainSecond] = await Promise.all([models.inbox.enqueueAsk({ type: 'user', origin: 'main', message: 'Proceed?' }), models.inbox.enqueueAsk({ type: 'user', origin: 'main', message: 'Proceed?' })])
    expect(mainFirst.id).toBe(mainSecond.id)
  })

  it('attention filtering derives pending questions independently of ticket status and project', async () => {
    const other = await models.ticket.createWithThreads('p2', 'Other', ['thread-2'])
    const ask = await models.inbox.enqueueAsk({ type: 'main', origin: 'project', projectId: 'p1', ticketId, message: 'Approve?' })
    await models.inbox.enqueue({ type: 'main', origin: 'project', projectId: 'p2', ticketId: other.id, kind: 'notice', message: 'Notice' })
    expect((await models.ticket.listFiltered({ attentionOnly: true })).map(row => row.id)).toEqual([ticketId])
    expect(await models.ticket.listFiltered({ attentionOnly: true, projectId: 'p2' })).toEqual([])
    await models.inbox.answerScoped(ask.id, 'Yes', { type: 'main' }, now)
    expect(await models.ticket.listFiltered({ attentionOnly: true })).toEqual([])
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'queued' })
  })

  it('project activation rejects missing remotes and refuses ambiguous session ownership', async () => {
    await models.project.update('p1', { enabled: 0, remoteUrl: null })
    expect(await models.project.setEnabled('p1', true, now)).toBeUndefined()
    expect(await models.project.findById('p1')).toMatchObject({ enabled: 0, remoteUrl: null })
    await models.project.update('p1', { remoteUrl: 'https://github.com/org/p1.git' })
    expect(await models.project.setEnabled('p1', true, now)).toMatchObject({ enabled: 1 })
    await models.project.setOrchestrator('p2', 'manager-p1', now)
    await expect(models.project.findBySession('manager-p1')).rejects.toThrow('session_binding_conflict')
  })
})

describe('source revision and disabled project contracts', () => {
  it('cI revisions remain stable on replay and advance when only the head changes', async () => {
    const watch = new CiWatch(connection)
    const value = { id: 'github-main', channelId: 'github', kind: 'branch', ref: 'main', fingerprint: '["test"]', head: 'head-1', updatedAt: now }
    expect(await watch.recordRevision(value)).toMatchObject({ changed: true, row: { revision: 0, head: 'head-1' } })
    expect(await watch.recordRevision(value)).toMatchObject({ changed: false, row: { revision: 0, head: 'head-1' } })
    expect(await watch.recordRevision({ ...value, head: 'head-2' })).toMatchObject({ changed: true, row: { revision: 1, head: 'head-2' } })
    expect(await watch.recordRevision({ ...value, head: 'head-2' })).toMatchObject({ changed: false, row: { revision: 1, head: 'head-2' } })
  })

  it('disabled projects cannot queue a worker or change the waiting ticket state', async () => {
    await models.project.setEnabled('p1', false, now)
    await expect(models.worker.queue(ticketId, 'p1')).rejects.toThrow('项目未启用')
    expect(await models.worker.listByTicket(ticketId)).toEqual([])
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'queued' })
  })
})

describe('workspace fact synchronization', () => {
  it('workspace refresh preserves the stored identity disabled choice and manager session', async () => {
    await models.project.setEnabled('p1', false, now)
    const row = await models.project.upsertWorkspace({ id: 'candidate-other-id', workspaceId: 'workspace-p1', name: 'Renamed workspace', directory: '/isolated/renamed', remoteUrl: 'https://github.com/org/renamed.git' }, '2026-01-02T00:00:00.000Z')
    expect(row).toMatchObject({ id: 'p1', workspaceId: 'workspace-p1', enabled: 0, orchestratorSessionId: 'manager-p1', name: 'Renamed workspace', directory: '/isolated/renamed', remoteUrl: 'https://github.com/org/renamed.git', createdAt: now })
    expect(await models.project.findById('candidate-other-id')).toBeUndefined()
    expect(await models.project.listAll()).toHaveLength(2)
  })

  it('new workspace synchronization only enables a candidate that has a remote', async () => {
    const enabled = await models.project.upsertWorkspace({ id: 'p3', workspaceId: 'workspace-p3', name: 'Same label', directory: '/isolated/p3', remoteUrl: 'https://github.com/org/p3.git' }, now)
    const disabled = await models.project.upsertWorkspace({ id: 'p4', workspaceId: 'workspace-p4', name: 'Same label', directory: '/isolated/p4', remoteUrl: null }, now)
    expect(enabled).toMatchObject({ id: 'p3', enabled: 1, orchestratorSessionId: null })
    expect(disabled).toMatchObject({ id: 'p4', enabled: 0, remoteUrl: null })
    expect(await models.project.setEnabled('p4', true, now)).toBeUndefined()
  })
})

describe('terminal ticket state', () => {
  it('ready settlement distinguishes tickets that own a pull request from those that do not', async () => {
    expect(await models.ticket.hasPullRequest(ticketId)).toBe(false)
    await models.ticket.save(ticketId, { prUrl: 'https://github.com/org/p1/pull/9' })
    expect(await models.ticket.hasPullRequest(ticketId)).toBe(true)
    const linked = await models.ticket.createWithThreads('p1', 'Pull thread', ['thread-3'])
    await models.thread.record({ id: 'github:org/p1:9', channelId: 'github', projectId: 'p1', refId: 'org/p1:9', kind: 'pull', title: 'PR #9', url: 'https://github.com/org/p1/pull/9', createdAt: now, updatedAt: now, triagedAt: null })
    await models.ticketThread.link(linked.id, 'github:org/p1:9', now)
    expect(await models.ticket.hasPullRequest(linked.id)).toBe(true)
  })

  it('completed is terminal and a human follow-up reopens it as queued', async () => {
    await models.ticket.finish(ticketId, 'completed', now, now)
    expect(await models.ticket.listOpen()).toEqual([])
    expect(await models.ticket.listFiltered()).toEqual([])
    expect(await models.ticket.setPausedIfOpen(ticketId, true, now)).toBeUndefined()
    await expect(models.worker.queue(ticketId, 'p1')).rejects.toThrow('工单不存在、已结束或不属于当前项目')
    expect(await models.ticket.reopen(ticketId, now)).toBe(true)
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'queued', endedAt: null })
  })

  it('conditional pause changes open tickets and refuses a terminal ticket', async () => {
    expect(await models.ticket.setPausedIfOpen(ticketId, true, now)).toMatchObject({ paused: 1 })
    await models.ticket.finish(ticketId, 'done', now, now)
    expect(await models.ticket.setPausedIfOpen(ticketId, false, now)).toBeUndefined()
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'done', paused: 1 })
  })
})
