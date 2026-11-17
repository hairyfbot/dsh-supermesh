import type { GhRequest, GhRunner } from '../src/channel/github/types'
import type { DB } from '../src/database/types'
import { DatabaseSync } from 'node:sqlite'
import { NodeSqliteDialect } from '@fileshed/kysely-node-sqlite'
import { Kysely } from 'kysely'
import { createStorage } from 'unstorage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GitHubChannel } from '../src/channel/github/channel'
import { GhError } from '../src/channel/github/runner'
import { migrations } from '../src/database/migrations'
import { Channel } from '../src/database/models/channel'
import { ChannelAccount } from '../src/database/models/channel-account'
import { CiWatch } from '../src/database/models/ci-watch'
import { Inbox } from '../src/database/models/inbox'
import { Project } from '../src/database/models/project'
import { SourceState } from '../src/database/models/source-state'
import { Thread } from '../src/database/models/thread'
import { Ticket } from '../src/database/models/ticket'
import { TicketThread } from '../src/database/models/ticket-thread'
import { Trigger } from '../src/database/models/trigger'
import { Worker } from '../src/database/models/worker'

const isolated = vi.hoisted(() => ({
  db: null as unknown as typeof import('../src/database').db,
  storage: null as unknown as ReturnType<typeof import('unstorage').createStorage>,
}))
vi.mock('../src/database', () => ({ get db() {
  return isolated.db
} }))
vi.mock('../src/storage', () => ({ get storage() {
  return isolated.storage
} }))
const at = '2026-11-17T08:00:00.000Z'
let channel: GitHubChannel
let runner: RecordingRunner
let native: DatabaseSync

class RecordingRunner implements GhRunner {
  calls: GhRequest[] = []
  topics: Record<string, unknown>[] = []
  comments: Record<string, unknown>[] = []
  posted: Record<string, unknown>[] = []
  account = { id: 1, login: 'nexus', type: 'User' }
  failPost = false
  failComments = false
  responses = new Map<string, unknown>()
  async request(request: GhRequest): Promise<unknown> {
    this.calls.push(structuredClone({ ...request, signal: undefined }))
    if (this.responses.has(request.path)) {
      const response = this.responses.get(request.path)
      if (response instanceof Error)
        throw response
      return structuredClone(response)
    }
    if (request.path === 'user')
      return this.account
    if (request.path === 'repos/org/repo')
      return { id: 100, full_name: 'Org/Repo' }
    if (request.path === 'repos/org/other')
      return { id: 101, full_name: 'Org/Other' }
    if (request.method === 'POST') {
      const response = { id: this.posted.length + 100, body: request.body!.body, user: this.account, html_url: 'https://github.com/org/repo/issues/12#issuecomment-100', created_at: at, updated_at: at }
      this.posted.push(response)
      if (this.failPost)
        throw new GhError('transport_unknown')
      return response
    }
    if (request.path.includes('/issues?'))
      return this.topics
    if (request.path.includes('/issues/comments?')) {
      if (this.failComments)
        throw new GhError('forbidden')
      return this.comments
    }
    if (request.path.includes('/issues/12/comments?'))
      return this.posted
    if (request.path.endsWith('/issues/12'))
      return issue()
    throw new Error(`Unexpected request: ${request.path}`)
  }
}

function issue(repository = 'org/repo') {
  return { id: 1012, number: 12, title: 'Repair', body: 'Please fix @nexus', state: 'open', created_at: at, updated_at: at, html_url: `https://github.com/${repository}/issues/12`, user: { id: 42, login: 'alice', type: 'User' } }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at)
  isolated.storage = createStorage()
  native = new DatabaseSync(':memory:')
  for (const key of Object.keys(migrations).sort()) native.exec(migrations[key]!)
  const connection = new Kysely<DB>({ dialect: new NodeSqliteDialect({ database: native }) })
  isolated.db = Object.assign(connection, {
    channel: new Channel(connection),
    channelAccount: new ChannelAccount(connection),
    ciWatch: new CiWatch(connection),
    inbox: new Inbox(connection),
    project: new Project(connection),
    sourceState: new SourceState(connection),
    thread: new Thread(connection),
    ticket: new Ticket(connection),
    ticketThread: new TicketThread(connection),
    trigger: new Trigger(connection),
    worker: new Worker(connection),
  }) as typeof isolated.db
  await isolated.db.channel.create({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: at })
  await isolated.db.channelAccount.create({ id: 'bot', channelId: 'github', role: 'bot', name: 'nexus', status: 'online', avatar: null, createdAt: at })
  await isolated.db.channelAccount.create({ id: 'admin', channelId: 'github', role: 'admin', name: 'alice', status: 'online', avatar: null, createdAt: at })
  await isolated.db.project.create({ id: 'p', name: 'Display only', workspaceId: 'w', directory: '/isolated', remoteUrl: 'git@github.com:Org/Repo.git', enabled: 1, orchestratorSessionId: null, createdAt: at, updatedAt: at })
  runner = new RecordingRunner()
  channel = new GitHubChannel(runner)
})

afterEach(async () => {
  await isolated.db.destroy()
  await isolated.storage.dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function outgoing(id: string, kind: 'notice' | 'ask' = 'notice', ticketId: string | null = null) {
  await isolated.db.thread.record({ id: 'thread', refId: 'org/repo:12', channelId: 'github', kind: 'issue', title: 'Repair', url: 'https://github.com/org/repo/issues/12', projectId: null, triage: 'pending', triagedAt: null, createdAt: at, updatedAt: at })
  await isolated.db.trigger.ingest({ id: 'trigger', channelId: 'github', threadId: 'thread', kind: 'comment', actorName: 'alice', human: 1, mentioned: 1, text: 'fix', url: 'https://github.com/org/repo/issues/12#issuecomment-1', at, ref: null })
  if (ticketId)
    await isolated.db.ticketThread.link(ticketId, 'thread', at)
  return isolated.db.inbox.enqueue({ id, type: 'user', origin: 'main', kind, message: `Response ${id}`, triggerId: 'trigger', threadId: 'thread', ticketId })
}

async function ticket() {
  await isolated.db.ticket.create({ id: 'T-1', projectId: 'p', channelId: 'github', title: 'Repair', status: 'review', description: null, createdAt: at, updatedAt: at, startedAt: null, endedAt: null, prUrl: null, prState: null, ciState: null, paused: 0, prepareError: null })
}

describe('gitHub source collection', () => {
  it('uses verified remote identity and persists each revision and inbox once across overlapping scans', async () => {
    runner.topics = [issue()]
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.trigger.listByThread('github:org/repo:12')).toHaveLength(1)
    expect(await isolated.db.inbox.listPending('main')).toHaveLength(1)
    expect(await isolated.db.thread.findByRef('github', 'org/repo:12')).toMatchObject({ title: 'Repair', triage: 'pending', projectId: null })
    expect(runner.calls[1]!.path).toBe('repos/org/repo')
    expect(JSON.parse((await isolated.db.sourceState.find('github', 'org/repo:cursor:topics'))!.value)).toEqual({ since: at })
  })

  it('keeps same-number issues in separate repositories and refuses unknown or changed accounts', async () => {
    await isolated.db.project.create({ id: 'q', name: 'Same display', workspaceId: 'v', directory: '/other', remoteUrl: 'https://github.com/org/other', enabled: 1, orchestratorSessionId: null, createdAt: at, updatedAt: at })
    runner.topics = [issue()]
    expect(await channel.collect('p')).toEqual({ ok: true })
    runner.topics = [issue('org/other')]
    expect(await channel.collect('q')).toEqual({ ok: true })
    expect(await isolated.db.thread.findByRef('github', 'org/other:12')).toMatchObject({ id: 'github:org/other:12' })
    runner.account = { id: 2, login: 'nexus', type: 'User' }
    await expect(channel.verifyEnvironment('p')).rejects.toThrow('environment_identity_changed')
    runner.account = { id: 1, login: 'imposter', type: 'User' }
    await expect(channel.verifyEnvironment('q')).rejects.toThrow('account_mismatch')
  })

  it('records untrusted comments without allowing non-admins or bots to create new work', async () => {
    runner.topics = [issue()]
    await channel.collect('p')
    const row = { id: 9, body: '@nexus do this', issue_url: 'https://api.github.com/repos/org/repo/issues/12', html_url: 'https://github.com/org/repo/issues/12#issuecomment-9', created_at: at, updated_at: at }
    runner.comments = [{ ...row, user: { id: 50, login: 'stranger', type: 'User' } }, { ...row, id: 10, user: { id: 1, login: 'nexus', type: 'User' } }]
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.trigger.listByThread('github:org/repo:12')).toHaveLength(3)
    expect(await isolated.db.inbox.listPending('main')).toHaveLength(1)
  })

  it('does not advance a failing stream cursor and retries the missing stream', async () => {
    runner.failComments = true
    expect(await channel.collect('p')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await isolated.db.sourceState.find('github', 'org/repo:cursor:comments')).toBeUndefined()
    runner.failComments = false
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(JSON.parse((await isolated.db.sourceState.find('github', 'org/repo:cursor:comments'))!.value)).toMatchObject({ since: at })
  })

  it('blocks disabled or missing remote projects before remote calls', async () => {
    await isolated.db.project.update('p', { enabled: 0 })
    expect(await channel.collect('p')).toEqual({ ok: false, reason: 'project_disabled' })
    expect(runner.calls).toHaveLength(0)
    await isolated.db.project.update('p', { enabled: 1, remoteUrl: null })
    expect(await channel.collect('p')).toEqual({ ok: false, reason: 'unknown_repository' })
    expect(runner.calls).toHaveLength(0)
  })
})

describe('gitHub original source reading', () => {
  it('returns original text with continuation and rejects unregistered or unsafe resources', async () => {
    runner.posted = [{ id: 8, body: 'A comment', user: { login: 'alice' }, html_url: 'https://github.com/org/repo/issues/12#issuecomment-8', created_at: at, updated_at: at }]
    expect(await channel.read('https://github.com/org/repo/issues/12', 0, 1)).toMatchObject({ items: [{ kind: 'issue', body: 'Please fix @nexus' }], next_offset: 1, next_resource: null })
    expect(await channel.read('github:org/repo:issue:12', 1, 1)).toMatchObject({ items: [{ kind: 'comment', body: 'A comment' }], next_offset: null })
    await expect(channel.read('http://github.com/org/repo/issues/12')).rejects.toThrow('invalid_resource')
    await expect(channel.read('https://evil.example/org/repo/issues/12')).rejects.toThrow('invalid_resource')
    await expect(channel.read('https://github.com/org/repo/issues/12', -1)).rejects.toThrow('invalid_pagination')
    await expect(channel.read('https://github.com/unregistered/repo/issues/12')).rejects.toThrow('unknown_repository')
  })
})

function pull() {
  return { ...issue(), html_url: 'https://github.com/org/repo/pull/12', pull_request: {}, merged: false, head: { sha: 'head-a', ref: 'nexus/T-1' }, base: { ref: 'main', repo: { full_name: 'org/repo' } } }
}

async function subscribedPull() {
  await ticket()
  await isolated.db.ticket.setPullRequest('T-1', 'https://github.com/org/repo/pull/12', 'open', 'pending')
  await isolated.db.thread.record({ id: 'pull', refId: 'org/repo:12', channelId: 'github', kind: 'pull', title: 'Repair', url: 'https://github.com/org/repo/pull/12', projectId: 'p', triage: 'claimed', triagedAt: at, createdAt: at, updatedAt: at })
  await isolated.db.ticketThread.link('T-1', 'pull', at)
  runner.responses.set('repos/org/repo/pulls/12', pull())
}

function check(id: number, name: string, conclusion = 'success', head = 'head-a') {
  return { id, name, app: { id: 1 }, head_sha: head, status: 'completed', conclusion, created_at: at, started_at: at, completed_at: at }
}

function ci(head = 'head-a', checks: Record<string, unknown>[] = [check(1, 'test', 'success', head)]) {
  runner.responses.set(`repos/org/repo/commits/${head}/check-runs?per_page=100&page=1`, { check_runs: checks })
  runner.responses.set(`repos/org/repo/commits/${head}/status?per_page=100&page=1`, { sha: head, statuses: [] })
}

describe('gitHub CI evidence', () => {
  it('reads every CI page, selects latest same-name runs and notifies each observed revision once', async () => {
    await subscribedPull()
    const checks = Array.from({ length: 99 }, (_, index) => check(index + 1, `other-${index}`))
    checks.push(check(100, 'test', 'failure'))
    ci('head-a', checks)
    runner.responses.set('repos/org/repo/commits/head-a/check-runs?per_page=100&page=2', { check_runs: [check(200, 'test')] })
    runner.responses.set('repos/org/repo/commits/head-a/status?per_page=100&page=1', { sha: 'head-a', statuses: [{ id: 9, context: 'deploy', state: 'success', updated_at: at }, { id: 8, context: 'deploy', state: 'failure', updated_at: at }] })
    expect(await channel.collectPullRequest('p', 'pull')).toEqual({ ok: true })
    expect(await isolated.db.ticket.findById('T-1')).toMatchObject({ status: 'review', prState: 'open', ciState: 'passing' })
    expect(await isolated.db.inbox.listPending('project', 'p')).toHaveLength(1)
    expect(runner.calls.some(call => call.path.endsWith('check-runs?per_page=100&page=2'))).toBe(true)
    expect(await channel.collectPullRequest('p', 'pull')).toEqual({ ok: true })
    expect(await isolated.db.inbox.listPending('project', 'p')).toHaveLength(1)
    runner.responses.set('repos/org/repo/pulls/12', { ...pull(), merged: true, state: 'closed' })
    expect(await channel.collectPullRequest('p', 'pull')).toEqual({ ok: true })
    expect(await isolated.db.ticket.findById('T-1')).toMatchObject({ status: 'review', prState: 'merged' })
    expect(await isolated.db.inbox.listPending('project', 'p')).toHaveLength(2)
  })

  it('retains an observed merge when CI fails and reports failure while collecting healthy topics', async () => {
    await subscribedPull()
    runner.responses.set('repos/org/repo/pulls/12', { ...pull(), merged: true, state: 'closed' })
    runner.responses.set('repos/org/repo/commits/head-a/check-runs?per_page=100&page=1', new GhError('forbidden'))
    runner.topics = [pull(), { ...issue(), id: 1013, number: 13, html_url: 'https://github.com/org/repo/issues/13' }]
    runner.responses.set('repos/org/repo/pulls/12/reviews?per_page=100&page=1', [])
    runner.responses.set('repos/org/repo/pulls/12/comments?per_page=100&page=1', [])
    expect(await channel.collect('p')).toEqual({ ok: false, reason: 'forbidden' })
    expect(await isolated.db.thread.findByRef('github', 'org/repo:13')).toMatchObject({ title: 'Repair' })
    expect(await isolated.db.ticket.findById('T-1')).toMatchObject({ prState: 'merged', ciState: 'pending', status: 'review' })
    expect(await isolated.db.sourceState.find('github', 'org/repo:cursor:topics')).toBeUndefined()
    expect(JSON.parse((await isolated.db.sourceState.find('github', 'org/repo:cursor:comments'))!.value)).toMatchObject({ since: at })
  })

  it('creates branch CI notices once per failure revision with no reply address', async () => {
    ci('head-a', [check(1, 'test', 'failure')])
    runner.responses.set('repos/org/repo/commits/main', { sha: 'head-a' })
    await channel.collectBranch('p', 'main')
    await channel.collectBranch('p', 'main')
    expect(await isolated.db.inbox.listPending('project', 'p')).toHaveLength(1)
    expect(await isolated.db.thread.findByRef('github', 'org/repo:branch:main')).toMatchObject({ kind: 'ci', url: null, projectId: 'p' })
    ci('head-b', [check(2, 'test', 'failure', 'head-b')])
    runner.responses.set('repos/org/repo/commits/main', { sha: 'head-b' })
    await channel.collectBranch('p', 'main')
    expect(await isolated.db.inbox.listPending('project', 'p')).toHaveLength(2)
    expect(await isolated.db.ciWatch.findTarget('github', 'branch', 'org/repo:branch:main')).toMatchObject({ revision: 1, head: 'head-b' })
  })
})

function answerComment(body: string, login = 'alice') {
  return { id: 9, body, issue_url: 'https://api.github.com/repos/org/repo/issues/12', html_url: 'https://github.com/org/repo/issues/12#issuecomment-9', created_at: at, updated_at: at, user: { id: 42, login, type: 'User' } }
}

describe('gitHub explicit answers', () => {
  it('accepts one administrator answer for the published question without overwriting it on edits', async () => {
    await outgoing('question', 'ask')
    await channel.publish('question')
    runner.comments = [answerComment('answer question: Proceed')]
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.inbox.findById('question')).toMatchObject({ status: 'done', answer: 'Proceed', answeredBy: 'user' })
    runner.comments[0] = { ...answerComment('answer question: Stop'), updated_at: '2026-11-17T08:01:00.000Z' }
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.inbox.findById('question')).toMatchObject({ answer: 'Proceed' })
    expect(runner.posted).toHaveLength(1)
  })

  it('rejects outsiders, conflicting lines and old comments instead of guessing an answer', async () => {
    await outgoing('question', 'ask')
    await channel.publish('question')
    runner.comments = [answerComment('answer question: Proceed', 'outsider')]
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.inbox.findById('question')).toMatchObject({ status: 'pending', answer: null })
    runner.comments = [answerComment('answer question: Proceed\nanswer question: Stop')]
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.inbox.findById('question')).toMatchObject({ status: 'pending', answer: null })
    runner.comments = [{ ...answerComment('answer question: Proceed'), created_at: '2026-11-16T08:00:00.000Z' }]
    expect(await channel.collect('p')).toEqual({ ok: true })
    expect(await isolated.db.inbox.findById('question')).toMatchObject({ status: 'pending', answer: null })
  })

  it('does not post an already answered or terminal-ticket question', async () => {
    await outgoing('answered', 'ask')
    await isolated.db.inbox.answerByUser('answered', 'Web answer', at)
    expect(await channel.publish('answered')).toEqual({ ok: true })
    await ticket()
    await outgoing('terminal', 'ask', 'T-1')
    await isolated.db.ticket.finish('T-1', 'done', at, at)
    expect(await channel.publish('terminal')).toEqual({ ok: false, reason: 'delivery_superseded' })
    expect(runner.posted).toHaveLength(0)
  })
})

describe('gitHub Inbox delivery', () => {
  it('completes a notice only after verified delivery and preserves an unanswered ask', async () => {
    await outgoing('notice')
    await outgoing('question', 'ask')
    expect(await channel.publish('notice')).toEqual({ ok: true, remoteId: '100' })
    expect(await isolated.db.inbox.findById('notice')).toMatchObject({ status: 'done', deliveryError: null, readAt: null })
    expect(await channel.publish('question')).toEqual({ ok: true, remoteId: '101' })
    expect(await isolated.db.inbox.findById('question')).toMatchObject({ status: 'pending', readAt: null, answer: null })
    expect(await new GitHubChannel(runner).publish('question')).toEqual({ ok: true, remoteId: '101' })
    expect(runner.posted).toHaveLength(2)
  })

  it('does not repeat a result-unknown write or let a later notice pass it', async () => {
    await outgoing('first')
    await outgoing('later')
    runner.failPost = true
    expect(await channel.publish('first')).toEqual({ ok: false, reason: 'transport_unknown' })
    expect(await isolated.db.inbox.findById('first')).toMatchObject({ status: 'stalled', deliveryError: 'transport_unknown' })
    expect(await channel.publish('later')).toEqual({ ok: false, reason: 'earlier_delivery_pending' })
    expect(await new GitHubChannel(runner).publish('first')).toEqual({ ok: true, remoteId: '100' })
    expect(runner.posted).toHaveLength(1)
  })

  it('recovers a known remote marker before posting again after a crash', async () => {
    await outgoing('notice')
    await isolated.db.inbox.recordDeliveryFailure('notice', 'publishing', at)
    runner.posted = [{ id: 77, body: 'Response notice\n\n<!-- nexus:notice -->', user: runner.account, html_url: 'https://github.com/org/repo/issues/12#issuecomment-77' }]
    expect(await channel.publish('notice')).toEqual({ ok: true, remoteId: '77' })
    expect(runner.calls.filter(call => call.method === 'POST')).toHaveLength(0)
    expect(await isolated.db.inbox.findById('notice')).toMatchObject({ status: 'done', deliveryAttempts: 0 })
  })

  it('blocks paused tickets and CI threads without inventing reply addresses', async () => {
    await ticket()
    await outgoing('notice', 'notice', 'T-1')
    await isolated.db.ticket.setPaused('T-1', true, at)
    expect(await channel.publish('notice')).toEqual({ ok: false, reason: 'human_paused' })
    expect(runner.calls).toHaveLength(0)
    await isolated.db.ticket.setPaused('T-1', false, at)
    await isolated.db.thread.update('thread', { kind: 'ci', url: null })
    expect(await channel.publish('notice')).toEqual({ ok: false, reason: 'no_reply_address' })
    expect(runner.posted).toHaveLength(0)
  })
})
