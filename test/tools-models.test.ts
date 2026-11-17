import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { DB } from '../src/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrations } from '../src/database/migrations'
import { Channel } from '../src/database/models/channel'
import { CiWatch } from '../src/database/models/ci-watch'
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

const boundary = vi.hoisted(() => ({
  db: {} as Record<string, unknown>,
  identity: { role: 'main' } as { role: string, projectId?: string, supervisorId?: string, ticketId?: string, workerId?: string },
  create: vi.fn(),
  send: vi.fn(),
  cancel: vi.fn(),
  read: vi.fn(),
  reconcile: vi.fn(),
}))

vi.mock('../src/database', () => ({ db: boundary.db }))
vi.mock('../src/service/session', () => ({ session: { resolve: async () => boundary.identity, create: boundary.create, send: boundary.send, cancel: boundary.cancel, rename: vi.fn(), view: vi.fn() } }))
vi.mock('../src/channel/github/channel', () => ({ github: { read: boundary.read } }))
vi.mock('../src/service/worker', () => ({ worker: { reconcile: boundary.reconcile } }))

const now = '2026-01-01T00:00:00.000Z'
let sqlite: DatabaseSync
let connection: Kysely<DB>
let models: ReturnType<typeof makeModels>
let ticketId: string

function makeModels(db: Kysely<DB>) {
  return { channel: new Channel(db), project: new Project(db), inbox: new Inbox(db), ticket: new Ticket(db), ticketThread: new TicketThread(db), ticketLink: new TicketLink(db), supervisor: new Supervisor(db), supervisorTicket: new SupervisorTicket(db), thread: new Thread(db), trigger: new Trigger(db), worker: new Worker(db) }
}

async function invoke(tool: ToolDefinition, args: unknown) {
  const exec = { agent: { session: { id: 'caller' } }, signal: new AbortController().signal } as ToolRunContext
  return JSON.parse(String(await tool.execute(args, exec)))
}

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  for (const [, migration] of Object.entries(migrations).sort(([left], [right]) => left.localeCompare(right))) sqlite.exec(migration)
  sqlite.exec('PRAGMA foreign_keys = ON')
  connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: sqlite }) })
  models = makeModels(connection)
  Object.assign(boundary.db, models)
  boundary.identity = { role: 'main' }
  boundary.create.mockReset().mockResolvedValue('supervisor-session')
  boundary.send.mockReset().mockResolvedValue(undefined)
  boundary.cancel.mockReset().mockResolvedValue(undefined)
  boundary.read.mockReset().mockResolvedValue({ items: [], next_offset: null, next_resource: null })
  boundary.reconcile.mockReset().mockResolvedValue(undefined)
  await models.channel.create({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: now })
  for (const id of ['p1', 'p2']) await models.project.create({ id, name: id, remoteUrl: `https://github.com/org/${id}.git`, enabled: 1, workspaceId: `workspace-${id}`, directory: `/isolated/${id}`, orchestratorSessionId: `manager-${id}`, createdAt: now, updatedAt: now })
  for (const [id, projectId, number] of [['thread-1', 'p1', '1'], ['thread-2', 'p2', '2'], ['thread-3', 'p1', '3']]) await models.thread.record({ id, channelId: 'github', projectId, refId: number, kind: 'issue', title: id, url: `https://github.com/org/${projectId}/issues/${number}`, createdAt: now, updatedAt: now, triagedAt: null })
  ticketId = (await models.ticket.createWithThreads('p1', 'Fix parser', ['thread-1'])).id
})

afterEach(async () => {
  vi.restoreAllMocks()
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
    expect(first).toMatchObject({ status: 'queued', branch: `nexus/${ticketId}`, worktree: null })
    expect(await models.worker.listByTicket(ticketId)).toHaveLength(1)
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'queued' })
    await expect(models.worker.queue(ticketId, 'p2')).rejects.toThrow('不属于当前项目')
    await expect(models.worker.queue(ticketId, 'p1', 'nexus/wrong')).rejects.toThrow('分支末段必须是任务号')
  })

  it('worker report and notification roll back together when inbox insertion fails', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    sqlite.exec('CREATE TRIGGER reject_report BEFORE INSERT ON inbox WHEN NEW.kind = \'ticket\' BEGIN SELECT RAISE(ABORT, \'report rejected\'); END')
    await expect(models.worker.reportProgress(worker.id, 'ready', 'Finished')).rejects.toThrow('report rejected')
    expect(await models.worker.findById(worker.id)).toMatchObject({ report: null, reportState: null, reportAt: null })
    expect(await models.inbox.listByTicket(ticketId)).toEqual([])
  })

  it('worker report records facts atomically and rejects a terminal ticket', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    const report = await models.worker.reportProgress(worker.id, 'failed', 'Compiler failed')
    expect(report).toMatchObject({ type: 'project', projectId: 'p1', workerId: worker.id, ticketId, kind: 'ticket', message: 'Compiler failed' })
    expect(await models.worker.findById(worker.id)).toMatchObject({ reportState: 'failed', report: 'Compiler failed' })
    await models.ticket.finish(ticketId, 'done', now, now)
    await expect(models.worker.reportProgress(worker.id, 'progress', 'Too late')).rejects.toThrow('工单已结束')
    expect(await models.inbox.listByTicket(ticketId)).toHaveLength(1)
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

describe('tool permission and routing contracts', () => {
  it('manager ticket listing derives project scope from session identity', async () => {
    const other = await models.ticket.createWithThreads('p2', 'Other repo', ['thread-2'])
    boundary.identity = { role: 'project', projectId: 'p1' }
    const { list_ticket } = await import('../src/ai/manager/tools/ticket')
    expect((await invoke(list_ticket, { projectId: 'p2' })).map((row: { id: string }) => row.id)).toEqual([ticketId])
    expect(await models.ticket.findById(other.id)).toMatchObject({ projectId: 'p2' })
  })

  it('manager report routes by supervisorId while ticketId remains trace data', async () => {
    await models.supervisor.create({ id: 's1', sessionId: 's-session', title: 'Coordination', reason: 'Across repos', createdAt: now, closedAt: null })
    await models.supervisorTicket.link('s1', ticketId, now)
    boundary.identity = { role: 'project', projectId: 'p1' }
    const { report } = await import('../src/ai/manager/tools/communicate')
    expect(await invoke(report, { state: 'progress', summary: 'Direct to main', ticketId })).toMatchObject({ type: 'main', supervisorId: null, ticketId })
    expect(await invoke(report, { state: 'progress', summary: 'To supervisor', ticketId, supervisorId: 's1' })).toMatchObject({ type: 'supervisor', supervisorId: 's1', ticketId })
  })

  it('ticket notes preserve terminal status while dispatch rejects terminal tickets', async () => {
    await models.ticket.finish(ticketId, 'done', now, now)
    const { note_ticket, dispatch_ticket } = await import('../src/ai/_shared/tools/ticket')
    expect(await invoke(note_ticket, { ticketId, text: 'API deployed' })).toMatchObject({ kind: 'notice', type: 'project', ticketId })
    await expect(invoke(dispatch_ticket, { ticketId })).rejects.toThrow('工单已结束')
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'done' })
  })

  it('thread attachment is idempotent and cannot unlink the original source', async () => {
    const { attach_thread_to_ticket, unlink_thread } = await import('../src/ai/orchestrator/tools/thread')
    await invoke(attach_thread_to_ticket, { ticketId, threadId: 'thread-3' })
    expect(await invoke(attach_thread_to_ticket, { ticketId, threadId: 'thread-3' })).toMatchObject({ existing: true })
    expect(await models.inbox.listByTicket(ticketId)).toHaveLength(1)
    await expect(invoke(unlink_thread, { ticketId, threadId: 'thread-1', reason: 'Wrong' })).rejects.toThrow('不能摘掉触发来源')
    await invoke(unlink_thread, { ticketId, threadId: 'thread-3', reason: 'Unrelated' })
    expect((await models.ticketThread.listByTicket(ticketId)).map(row => row.threadId)).toEqual(['thread-1'])
    expect(await models.thread.findById('thread-3')).toMatchObject({ triage: 'pending', projectId: 'p1' })
  })

  it('worker channel reads reject unrelated resources before calling the remote adapter', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    boundary.identity = { role: 'worker', projectId: 'p1', ticketId, workerId: worker.id }
    const { read_channel } = await import('../src/ai/_shared/tools/channel')
    await expect(invoke(read_channel, { resource: 'https://github.com/org/p2/issues/2' })).rejects.toThrow('只能读取本任务来源')
    expect(boundary.read).not.toHaveBeenCalled()
    await invoke(read_channel, { resource: 'https://github.com/org/p1/issues/1#issuecomment-1' })
    expect(boundary.read).toHaveBeenCalledWith('https://github.com/org/p1/issues/1#issuecomment-1', 0, 50)
  })

  it('supervisor closure notifies each project once without changing any ticket status', async () => {
    const second = await models.ticket.createWithThreads('p1', 'Second ticket', ['thread-3'])
    await models.supervisor.create({ id: 's1', sessionId: 's-session', title: 'Coordinate', reason: 'Original reason', createdAt: now, closedAt: null })
    await models.supervisorTicket.link('s1', ticketId, now)
    await models.supervisorTicket.link('s1', second.id, now)
    const { close_supervisor } = await import('../src/ai/orchestrator/tools/supervisor')
    expect(await invoke(close_supervisor, { supervisorId: 's1', reason: 'Coordination complete' })).toMatchObject({ notified: ['p1'] })
    const notices = await models.inbox.listScoped({ type: 'project', projectId: 'p1' })
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'notice', title: 'Coordinate' })
    expect(notices[0]!.message).toContain('Coordination complete')
    expect(notices[0]!.message).toContain(ticketId)
    expect(notices[0]!.message).toContain(second.id)
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'waiting' })
    expect(await models.supervisor.findById('s1')).toMatchObject({ status: 'closed', reason: 'Original reason' })
  })
})

describe('queue and project boundary regressions', () => {
  it('worker cancel passes keepInbox to the SDK without consuming worker reports', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    const report = await models.worker.reportProgress(worker.id, 'progress', 'Working')
    boundary.identity = { role: 'project', projectId: 'p1' }
    const { cancel } = await import('../src/ai/manager/tools/worker')
    await invoke(cancel, { workerId: worker.id, keepInbox: false })
    expect(boundary.cancel).toHaveBeenCalledWith(worker.id, false)
    expect(await models.inbox.findById(report.id)).toMatchObject({ status: 'pending', origin: 'worker' })
    await invoke(cancel, { workerId: worker.id, keepInbox: true })
    expect(boundary.cancel).toHaveBeenLastCalledWith(worker.id, true)
  })

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
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'waiting' })
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

  it('channel replies queue against the exact trigger and reject CI topics with no reply address', async () => {
    const worker = await models.worker.queue(ticketId, 'p1')
    boundary.identity = { role: 'worker', projectId: 'p1', ticketId, workerId: worker.id }
    await models.trigger.ingest({ id: 'trigger-1', channelId: 'github', threadId: 'thread-1', kind: 'comment', actorName: 'human', human: 1, mentioned: 1, text: 'Hello', url: 'https://github.com/org/p1/issues/1#issuecomment-1', at: now, ref: null })
    await models.thread.record({ id: 'ci-thread', channelId: 'github', projectId: 'p1', refId: 'ci:main', kind: 'ci', title: 'CI failed', url: null, createdAt: now, updatedAt: now, triagedAt: null })
    await models.trigger.ingest({ id: 'trigger-ci', channelId: 'github', threadId: 'ci-thread', kind: 'ci', actorName: null, human: 0, mentioned: 0, text: 'Failed', url: null, at: now, ref: 'head' })
    const { reply_channel } = await import('../src/ai/_shared/tools/channel')
    const first = await invoke(reply_channel, { triggerId: 'trigger-1', text: 'Received' })
    const second = await invoke(reply_channel, { triggerId: 'trigger-1', text: 'Finished' })
    expect(first).toMatchObject({ status: 'queued' })
    const rows = await models.inbox.listOutgoing()
    expect(rows.map(row => row.id)).toEqual([first.id, second.id])
    expect(rows[0]).toMatchObject({ type: 'user', kind: 'notice', triggerId: 'trigger-1', threadId: 'thread-1', ticketId, workerId: worker.id, status: 'pending' })
    expect(rows[1]!.seq).toBeGreaterThan(rows[0]!.seq)
    await expect(invoke(reply_channel, { triggerId: 'trigger-ci', text: 'Cannot reply' })).rejects.toThrow('没有可回复地址')
    expect(boundary.send).not.toHaveBeenCalled()
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
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'waiting' })
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

describe('terminal and recovery tool contracts', () => {
  it('conditional pause changes open tickets and refuses a terminal ticket', async () => {
    expect(await models.ticket.setPausedIfOpen(ticketId, true, now)).toMatchObject({ paused: 1 })
    await models.ticket.finish(ticketId, 'done', now, now)
    expect(await models.ticket.setPausedIfOpen(ticketId, false, now)).toBeUndefined()
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'done', paused: 1 })
  })

  it('retry preserves the failed worker history and reuses the verified branch and worktree', async () => {
    const old = await models.worker.queue(ticketId, 'p1', `custom/${ticketId}`)
    await models.worker.update(old.id, { worktree: '/isolated/retained', reportState: 'failed', status: 'ended', endedReason: 'failed', endedAt: now })
    await models.ticket.setPrepareError(ticketId, 'previous preparation failed', now)
    boundary.identity = { role: 'project', projectId: 'p1' }
    const { retry_ticket } = await import('../src/ai/manager/tools/ticket')
    const replacement = await invoke(retry_ticket, { ticketId })
    expect(replacement.id).not.toBe(old.id)
    expect(replacement).toMatchObject({ status: 'queued', branch: `custom/${ticketId}`, worktree: '/isolated/retained' })
    expect(await models.worker.findById(old.id)).toMatchObject({ status: 'ended', endedReason: 'restarted', branch: `custom/${ticketId}`, worktree: '/isolated/retained' })
    expect(await models.ticket.findById(ticketId)).toMatchObject({ status: 'queued', prepareError: null })
    expect(boundary.reconcile).toHaveBeenCalledOnce()
  })

  it('concurrent thread attachment creates one subscription and one project notification', async () => {
    const { attach_thread_to_ticket } = await import('../src/ai/orchestrator/tools/thread')
    await Promise.all([invoke(attach_thread_to_ticket, { ticketId, threadId: 'thread-3' }), invoke(attach_thread_to_ticket, { ticketId, threadId: 'thread-3' })])
    expect(await models.ticketThread.listByThread('thread-3')).toHaveLength(1)
    expect(await models.inbox.listByTicket(ticketId)).toHaveLength(1)
  })

  it('asking a user queues one anchored question and keeps it pending until a human answers', async () => {
    await models.trigger.ingest({ id: 'human-trigger', channelId: 'github', threadId: 'thread-1', kind: 'comment', actorName: 'human', human: 1, mentioned: 1, text: 'Please proceed', url: 'https://github.com/org/p1/issues/1#issuecomment-1', at: now, ref: null })
    const { ask_user } = await import('../src/ai/orchestrator/tools/communicate')
    const first = await invoke(ask_user, { question: 'May we continue?', triggerId: 'human-trigger' })
    const duplicate = await invoke(ask_user, { question: 'May we continue?', triggerId: 'human-trigger' })
    expect(first).toEqual(duplicate)
    expect(first).toMatchObject({ status: 'pending', delivery: 'queued' })
    expect(await models.inbox.findById(first.id)).toMatchObject({ type: 'user', kind: 'ask', status: 'pending', triggerId: 'human-trigger', answer: null })
    expect(await models.inbox.listOutgoing()).toHaveLength(1)
    expect(boundary.send).not.toHaveBeenCalled()
  })
})
