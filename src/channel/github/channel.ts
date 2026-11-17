import type { Selectable } from 'kysely'
import type { DB } from '../../database/types'
import type { ChannelItem, DeliveryResult, GhRunner, ReadResult } from './types'
import { createHash } from 'node:crypto'
import { db } from '../../database'
import { setting } from '../../service/setting'
import { ExecFileGhRunner, GhError } from './runner'

type Thread = Selectable<DB['thread']>
type Inbox = Selectable<DB['inbox']>
interface Resource { repository: string, number: number, kind: 'issue' | 'pull' }
interface Identity { providerId: string, login: string, repositoryId: string, defaultBranch: string | null }
interface CiSnapshot { state: 'pending' | 'running' | 'passing' | 'failing', checks: Record<string, unknown>[], statuses: Record<string, unknown>[] }
interface PullFact { head: string, base: string, state: 'open' | 'closed' | 'merged', ciState: CiSnapshot['state'], collectedAt: string, updatedAt: string, ciError?: string, url: string }
interface Cursor { since: string, signature?: string, through?: string }
interface Receipt { remoteId: string, providerId: string, marker: string, url: string }

export class GitHubChannel {
  private readonly operations = new Map<string, Promise<unknown>>()
  private readonly publishing = new Map<string, Promise<void>>()

  constructor(private readonly runner: GhRunner = new ExecFileGhRunner()) {}

  private exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const current = this.operations.get(key)
    if (current)
      return current as Promise<T>
    const task = action().finally(() => this.operations.delete(key))
    this.operations.set(key, task)
    return task
  }

  private async request(path: string, signal?: AbortSignal, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: Record<string, unknown>): Promise<unknown> {
    signal?.throwIfAborted()
    return this.runner.request({ site: 'github.com', path, method, body, signal })
  }

  private async state<T>(repository: string, name: string): Promise<T | undefined> {
    const row = await db.sourceState.find('github', `${repository}:${name}`)
    return row ? JSON.parse(row.value) as T : undefined
  }

  private async save(repository: string, name: string, value: unknown): Promise<void> {
    await db.sourceState.set('github', `${repository}:${name}`, JSON.stringify(value), now())
  }

  private async project(projectId: string) {
    const project = await db.project.findById(projectId)
    if (!project || !repositoryOf(project.remoteUrl))
      throw new GhError('unknown_repository')
    if (!project.enabled)
      throw new GhError('project_disabled')
    return project
  }

  private async projectForRepository(repository: string) {
    const projects = (await db.project.listAll()).filter(project => repositoryOf(project.remoteUrl) === repository)
    if (projects.length !== 1)
      throw new GhError(projects.length ? 'ambiguous_repository' : 'unknown_repository')
    return projects[0]!
  }

  async verifyEnvironment(projectId: string, signal?: AbortSignal): Promise<Identity> {
    const project = await this.project(projectId)
    const channel = await db.channel.findById('github')
    if (!channel?.enabled)
      throw new GhError('channel_disabled')
    const bots = (await db.channelAccount.findByRole('github', 'bot')).filter(account => account.status === 'online')
    const account = record(await this.request('user', signal))
    const providerId = identity(account.id)
    const login = text(account.login)
    if (!bots.some(bot => bot.name.toLowerCase() === login.toLowerCase()))
      throw new GhError('account_mismatch')
    const repository = repositoryOf(project.remoteUrl)!
    const remote = record(await this.request(`repos/${repository}`, signal))
    if (text(remote.full_name).toLowerCase() !== repository)
      throw new GhError('repository_mismatch')
    const result = { providerId, login, repositoryId: identity(remote.id), defaultBranch: typeof remote.default_branch === 'string' ? remote.default_branch : null }
    const previous = await this.state<Identity>(repository, 'verified_environment')
    if (previous && (previous.providerId !== providerId || previous.repositoryId !== result.repositoryId))
      throw new GhError('environment_identity_changed')
    await this.save(repository, 'verified_environment', result)
    return result
  }

  private async pages(path: string, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
    const result: Record<string, unknown>[] = []
    for (let page = 1; ; page++) {
      const value = await this.request(`${path + (path.includes('?') ? '&' : '?')}per_page=100&page=${page}`, signal)
      const batch = array(value).map(record)
      result.push(...batch)
      if (batch.length < 100)
        return result
    }
  }

  async read(resource: string, offset = 0, limit = 50, signal?: AbortSignal): Promise<ReadResult> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new GhError('invalid_pagination')
    const target = parseResource(resource)
    const project = await this.projectForRepository(target.repository)
    if (!project)
      throw new GhError('unknown_repository')
    await this.verifyEnvironment(project.id, signal)
    const root = `repos/${target.repository}`
    const main = record(await this.request(root + (target.kind === 'pull' ? '/pulls/' : '/issues/') + target.number, signal))
    validateTopic(main, target)
    const items = [item(main, target.kind)]
    for (const row of await this.pages(`${root}/issues/${target.number}/comments`, signal))
      items.push(item(row, 'comment'))
    if (target.kind === 'pull') {
      for (const row of await this.pages(`${root}/pulls/${target.number}/reviews`, signal))
        items.push(item(row, 'review'))
      for (const row of await this.pages(`${root}/pulls/${target.number}/comments`, signal))
        items.push(item(row, 'review_comment'))
    }
    items.splice(1, items.length - 1, ...items.slice(1).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)))
    return { items: items.slice(offset, offset + limit), next_offset: offset + limit < items.length ? offset + limit : null, next_resource: null }
  }

  async collectAll(signal?: AbortSignal): Promise<{ projectId: string, ok: boolean, reason?: string }[]> {
    signal?.throwIfAborted()
    if (!(await db.channel.findById('github'))?.enabled)
      return []
    const result = []
    for (const project of await db.project.listAll()) {
      signal?.throwIfAborted()
      if (!project.enabled || !repositoryOf(project.remoteUrl))
        continue
      result.push({ projectId: project.id, ...await this.collect(project.id, signal) })
    }
    return result
  }

  async collect(projectId: string, signal?: AbortSignal): Promise<{ ok: boolean, reason?: string }> {
    return this.exclusive(`collect:${projectId}`, async () => {
      const errors: string[] = []
      const attempt = async (operation: () => Promise<unknown>) => {
        try {
          await operation()
        }
        catch (error) {
          if (signal?.aborted)
            throw error
          errors.push(failure(error))
        }
      }
      try {
        const project = await this.project(projectId)
        const environment = await this.verifyEnvironment(projectId, signal)
        const repository = repositoryOf(project.remoteUrl)!
        const baseline = await this.state<string>(repository, 'baseline') ?? now()
        await this.save(repository, 'baseline', baseline)
        await attempt(() => this.stream(repository, 'topics', `repos/${repository}/issues?state=all&sort=updated&direction=asc`, baseline, async (row) => {
          const target: Resource = { repository, number: number(row.number), kind: row.pull_request ? 'pull' : 'issue' }
          validateTopic(row, target)
          const thread = await this.ensureThread(target, row)
          await this.ingest(thread, row, target.kind === 'issue' && row.state === 'closed' ? 'close' : 'open', baseline)
          if (target.kind === 'pull') {
            const result = await this.collectPullRequest(projectId, thread.id, signal)
            if (!result.ok)
              throw new GhError(result.reason!)
          }
        }, signal))
        await attempt(() => this.stream(repository, 'comments', `repos/${repository}/issues/comments?sort=updated&direction=asc`, baseline, async (row) => {
          const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(text(row.issue_url))
          if (!match || match[1]!.toLowerCase() !== repository)
            throw new GhError('source_repository_mismatch')
          const thread = await db.thread.findByRef('github', `${repository}:${match[2]}`)
          if (thread) {
            await this.acceptAnswers(thread, row)
            await this.ingest(thread, row, 'comment', baseline)
          }
        }, signal))
        for (const thread of await db.thread.listByChannel('github')) {
          if (thread.kind !== 'pull' || !thread.url || !(await db.ticketThread.listTicketIds(thread.id)).length)
            continue
          await attempt(async () => {
            const target = parseResource(thread.url!)
            if (target.repository !== repository)
              return
            const root = `repos/${repository}/pulls/${target.number}`
            for (const [path, kind] of [['reviews', 'review'], ['comments', 'review_comment']] as const) {
              await attempt(async () => {
                for (const row of await this.pages(`${root}/${path}`, signal)) {
                  await this.acceptAnswers(thread, row)
                  await this.ingest(thread, row, 'comment', baseline, kind)
                }
              })
            }
            const result = await this.collectPullRequest(projectId, thread.id, signal)
            if (!result.ok)
              throw new GhError(result.reason!)
          })
        }
        if (environment.defaultBranch)
          await attempt(() => this.collectBranch(projectId, environment.defaultBranch!, signal))
        await this.save(repository, 'collection_status', { ok: !errors.length, reasons: [...new Set(errors)], collectedAt: now() })
      }
      catch (error) {
        if (signal?.aborted)
          throw error
        errors.push(failure(error))
      }
      return errors.length ? { ok: false, reason: [...new Set(errors)].join(',') } : { ok: true }
    })
  }

  private async stream(repository: string, name: string, path: string, baseline: string, accept: (row: Record<string, unknown>) => Promise<void>, signal?: AbortSignal): Promise<void> {
    const cursor = await this.state<Cursor>(repository, `cursor:${name}`) ?? { since: baseline }
    const startedAt = now()
    const rows = await this.pages(`${path}&since=${encodeURIComponent(cursor.since)}`, signal)
    const revisions = []
    let firstError: unknown
    for (const row of rows) {
      signal?.throwIfAborted()
      try {
        await accept(row)
      }
      catch (error) {
        if (signal?.aborted)
          throw error
        firstError ??= error
      }
      revisions.push(digest(row))
    }
    if (firstError)
      throw firstError
    const signature = digest(revisions.sort())
    await this.save(repository, `cursor:${name}`, cursor.signature === signature && cursor.through
      ? { since: cursor.through }
      : { since: cursor.since, signature, through: startedAt })
  }

  private async ensureThread(target: Resource, row: Record<string, unknown>): Promise<Thread> {
    const refId = `${target.repository}:${target.number}`
    const existing = await db.thread.findByRef('github', refId)
    const id = existing?.id ?? `github:${refId}`
    const value = { id, channelId: 'github', refId, kind: target.kind, title: text(row.title), url: text(row.html_url), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), projectId: null, triage: 'pending' as const, triagedAt: null }
    return db.thread.record(value)
  }

  private async ingest(thread: Thread, row: Record<string, unknown>, kind: 'open' | 'comment' | 'close', baseline: string, sourceKind: string = kind): Promise<void> {
    const author = record(row.user)
    const actorName = text(author.login)
    const accounts = await db.channelAccount.findByChannel('github')
    const bots = accounts.filter(account => account.role === 'bot')
    const human = author.type !== 'Bot' && !actorName.endsWith('[bot]') && !bots.some(bot => bot.name.toLowerCase() === actorName.toLowerCase())
    const body = typeof row.body === 'string' ? row.body : typeof row.state === 'string' ? row.state : ''
    const mentioned = bots.some(bot => new RegExp(`@${escapeRegex(bot.name)}(?![a-z0-9-])`, 'i').test(body))
    const at = timestamp(row.updated_at ?? row.submitted_at ?? row.created_at)
    const id = `${thread.id}:${sourceKind}:${identity(row.id)}`
    const trigger = { id, channelId: 'github', threadId: thread.id, kind, actorName, human: Number(human), mentioned: Number(mentioned), text: body, url: text(row.html_url), at, ref: row.head ? text(record(row.head).ref) : null }
    await db.trigger.ingest(trigger)
    const subscriptions = await db.ticketThread.listTicketIds(thread.id)
    const historical = timestamp(row.created_at ?? row.submitted_at) < baseline
    const admin = (await setting.load()).administrators.some(name => name.toLowerCase() === actorName.toLowerCase())
    if (!human || (historical && !subscriptions.length))
      return
    if (!subscriptions.length && (!admin || (kind !== 'open' && !mentioned) || (thread.triage === 'ignored' && !mentioned)))
      return
    const targets = new Map<string, { projectId: string | null, ticketId: string | null }>()
    for (const ticketId of subscriptions) {
      const ticket = await db.ticket.findById(ticketId)
      if (!ticket)
        continue
      if (['done', 'cancelled'].includes(ticket.status)) {
        if (!mentioned)
          continue
        const resumed = await db.ticket.reopen(ticketId, trigger.at)
        if (resumed) {
          await db.worker.queue(ticketId, ticket.projectId)
          targets.set(ticket.projectId, { projectId: ticket.projectId, ticketId })
        }
        continue
      }
      targets.set(ticket.projectId, { projectId: ticket.projectId, ticketId })
    }
    if (!subscriptions.length)
      targets.set(thread.projectId ?? 'main', { projectId: thread.triage === 'claimed' ? thread.projectId : null, ticketId: null })
    for (const [key, target] of targets) {
      const inboxId = `${id}:inbox:${key}`
      await db.inbox.enqueue({ id: inboxId, type: target.projectId ? 'project' : 'main', origin: 'channel', kind: 'trigger', message: body, title: thread.title, projectId: target.projectId, ticketId: target.ticketId, triggerId: id, threadId: thread.id })
    }
  }

  private async ci(root: string, head: string, signal?: AbortSignal): Promise<CiSnapshot> {
    const previous = await this.state<CiSnapshot>(root.slice(6), `ci_runs:${head}`)
    const checks = new Map<string, Record<string, unknown>>()
    const statuses = new Map<string, Record<string, unknown>>()
    const acceptCheck = (check: Record<string, unknown>): void => {
      if (check.head_sha !== head)
        return
      const key = `${identity(record(check.app).id)}:${text(check.name)}`
      const prior = checks.get(key)
      if (!prior || number(check.id) > number(prior.id) || (check.id === prior.id && !(prior.status === 'completed' && check.status !== 'completed') && timestamp(check.completed_at ?? check.started_at ?? check.created_at) >= timestamp(prior.completed_at ?? prior.started_at ?? prior.created_at)))
        checks.set(key, check)
    }
    const acceptStatus = (status: Record<string, unknown>): void => {
      const key = text(status.context)
      const prior = statuses.get(key)
      if (!prior || timestamp(status.updated_at ?? status.created_at) > timestamp(prior.updated_at ?? prior.created_at) || (timestamp(status.updated_at ?? status.created_at) === timestamp(prior.updated_at ?? prior.created_at) && number(status.id) > number(prior.id)))
        statuses.set(key, status)
    }
    for (const check of previous?.checks ?? [])
      acceptCheck(check)
    for (const status of previous?.statuses ?? [])
      acceptStatus(status)
    for (const kind of ['check-runs', 'status'] as const) {
      for (let page = 1; ; page++) {
        const response = record(await this.request(`${root}/commits/${encodeURIComponent(head)}/${kind}?per_page=100&page=${page}`, signal))
        if (kind === 'status' && response.sha !== head)
          throw new GhError('ci_head_mismatch')
        const rows = array(response[kind === 'check-runs' ? 'check_runs' : 'statuses']).map(record)
        for (const row of rows)
          (kind === 'check-runs' ? acceptCheck : acceptStatus)(row)
        if (rows.length < 100)
          break
      }
    }
    const states = [...checks.values()].map(check => check.status === 'in_progress' ? 'running' : check.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(String(check.conclusion)) ? 'passing' : 'failing')
    states.push(...[...statuses.values()].map(status => status.state === 'success' ? 'passing' : status.state === 'pending' ? 'pending' : 'failing'))
    const state = states.includes('failing') ? 'failing' : states.includes('running') ? 'running' : !states.length || states.includes('pending') ? 'pending' : 'passing'
    const result: CiSnapshot = { state, checks: [...checks.values()], statuses: [...statuses.values()] }
    await this.save(root.slice(6), `ci_runs:${head}`, result)
    return result
  }

  async collectPullRequest(projectId: string, threadId: string, signal?: AbortSignal): Promise<{ ok: boolean, reason?: string }> {
    return this.exclusive(`pull:${threadId}`, async () => {
      const project = await this.project(projectId)
      await this.verifyEnvironment(projectId, signal)
      const thread = await db.thread.findById(threadId)
      if (!thread?.url || thread.kind !== 'pull')
        throw new GhError('invalid_pull_request')
      const target = parseResource(thread.url)
      if (target.repository !== repositoryOf(project.remoteUrl))
        throw new GhError('source_repository_mismatch')
      const root = `repos/${target.repository}`
      const remote = record(await this.request(`${root}/pulls/${target.number}`, signal))
      validateTopic(remote, target)
      const head = text(record(remote.head).sha)
      const base = record(remote.base)
      if (text(record(base.repo).full_name).toLowerCase() !== target.repository)
        throw new GhError('pull_request_mismatch')
      const state = remote.merged === true ? 'merged' : remote.state === 'open' ? 'open' : remote.state === 'closed' ? 'closed' : null
      if (!state)
        throw new GhError('invalid_response')
      const previous = await this.state<PullFact>(target.repository, `pr_fact:${target.number}`)
      const updatedAt = timestamp(remote.updated_at)
      if (previous && (previous.updatedAt > updatedAt || (previous.state === 'merged' && state !== 'merged')))
        return { ok: false, reason: 'stale_pr_snapshot' }
      let ciState: CiSnapshot['state'] = previous?.head === head ? previous.ciState : 'pending'
      let ciError: string | undefined
      let snapshot: CiSnapshot | undefined
      try {
        snapshot = await this.ci(root, head, signal)
        ciState = snapshot.state
      }
      catch (error) {
        if (signal?.aborted)
          throw error
        ciError = failure(error)
      }
      const fact: PullFact = { head, base: text(base.ref), state, ciState, collectedAt: now(), updatedAt, ciError, url: text(remote.html_url) }
      await this.save(target.repository, `pr_fact:${target.number}`, fact)
      const branch = typeof record(remote.head).ref === 'string' ? text(record(remote.head).ref) : null
      const worker = branch ? await db.worker.findByBranch(branch) : undefined
      const owned = worker && await db.ticket.findById(worker.ticketId)
      if (owned?.projectId === projectId && (!owned.prUrl || owned.prUrl === thread.url)) {
        await db.ticketThread.link(owned.id, thread.id, now())
        await db.ticket.setPullRequest(owned.id, thread.url, state, ciState)
      }
      const subscriptions = await db.ticketThread.listTicketIds(thread.id)
      for (const ticketId of subscriptions) {
        const ticket = await db.ticket.findById(ticketId)
        if (ticket?.projectId === projectId && ticket.prUrl === thread.url)
          await db.ticket.setPullRequest(ticketId, thread.url, state, ciState)
      }
      if (state === 'merged' || state === 'closed')
        await this.threadClosed(projectId, thread, state, remote.merged === true ? timestamp(remote.merged_at ?? remote.closed_at ?? remote.updated_at) : timestamp(remote.closed_at ?? remote.updated_at), branch)
      const fingerprint = digest({ head, state, ciState, ciError, checks: snapshot?.checks, statuses: snapshot?.statuses })
      const ref = `${target.repository}:${target.number}`
      const { row: watch } = await db.ciWatch.recordRevision({ id: `github:pull:${ref}`, channelId: 'github', kind: 'pull', ref, fingerprint, head, updatedAt: now() })
      const triggerId = `${watch.id}:revision:${watch.revision}`
      const message = `PR #${target.number}: ${state}, CI ${ciState}${ciError ? ` (${ciError})` : ''}`
      await db.trigger.ingest({ id: triggerId, channelId: 'github', threadId, kind: 'ci', actorName: null, human: 0, mentioned: 0, text: message, url: thread.url, at: now(), ref: head })
      for (const ticketId of subscriptions) {
        const ticket = await db.ticket.findById(ticketId)
        if (ticket?.projectId === projectId && !['done', 'cancelled'].includes(ticket.status))
          await db.inbox.enqueue({ id: `${triggerId}:ticket:${ticketId}`, type: 'project', origin: 'system', kind: 'notice', projectId, ticketId, triggerId, threadId, title: message, message })
      }
      return { ok: !ciError, ...(ciError ? { reason: ciError } : {}) }
    })
  }

  private async threadClosed(projectId: string, thread: Thread, outcome: 'merged' | 'closed', at: string, branch: string | null): Promise<void> {
    const ended = await db.ticket.closeThread(thread.id, outcome, at, branch)
    if (outcome !== 'merged' || !ended.length)
      return
    for (const source of await db.thread.listByChannel('github')) {
      if (source.kind !== 'issue' || source.projectId !== projectId || !source.url)
        continue
      if (!(await db.ticketThread.listTicketIds(source.id)).some(id => ended.includes(id)))
        continue
      let resource: Resource
      try {
        resource = parseResource(source.url)
      }
      catch {
        continue
      }
      if (resource.kind !== 'issue')
        continue
      await this.request(`repos/${resource.repository}/issues/${resource.number}`, undefined, 'PATCH', { state: 'closed' }).catch(() => undefined)
    }
  }

  async collectBranch(projectId: string, branch: string, signal?: AbortSignal): Promise<void> {
    const project = await this.project(projectId)
    await this.verifyEnvironment(projectId, signal)
    const repository = repositoryOf(project.remoteUrl)!
    const commit = record(await this.request(`repos/${repository}/commits/${encodeURIComponent(branch)}`, signal))
    const head = text(commit.sha)
    const snapshot = await this.ci(`repos/${repository}`, head, signal)
    const failing = snapshot.checks.filter(check => check.status === 'completed' && !['success', 'neutral', 'skipped'].includes(String(check.conclusion))).map(check => text(check.name))
    failing.push(...snapshot.statuses.filter(status => !['success', 'pending'].includes(String(status.state))).map(status => text(status.context)))
    const ref = `${repository}:branch:${branch}`
    const { row: watch } = await db.ciWatch.recordRevision({ id: `github:${ref}`, channelId: 'github', kind: 'branch', ref, fingerprint: digest({ state: snapshot.state, failing: failing.sort() }), head, updatedAt: now() })
    if (watch.revision === 0 && !failing.length)
      return
    const threadId = `github:${ref}`
    await db.thread.record({ id: threadId, channelId: 'github', refId: ref, kind: 'ci', title: `CI ${branch}`, url: null, projectId, triage: 'claimed', triagedAt: now(), createdAt: now(), updatedAt: now() })
    const triggerId = `${watch.id}:revision:${watch.revision}`
    const message = `${branch} CI ${snapshot.state}${failing.length ? `: ${failing.join(', ')}` : ''}`
    await db.trigger.ingest({ id: triggerId, channelId: 'github', threadId, kind: 'ci', actorName: null, human: 0, mentioned: 0, text: message, url: `https://github.com/${repository}/commit/${head}`, at: now(), ref: head })
    await db.inbox.enqueue({ id: `${triggerId}:project:${projectId}`, type: 'project', origin: 'system', kind: 'notice', projectId, triggerId, threadId, title: message, message })
  }

  private async acceptAnswers(thread: Thread, row: Record<string, unknown>): Promise<void> {
    const author = record(row.user)
    const login = text(author.login)
    const accounts = await db.channelAccount.findByChannel('github')
    if (author.type !== 'User' || login.endsWith('[bot]') || accounts.some(account => account.role === 'bot' && account.name.toLowerCase() === login.toLowerCase()) || !(await setting.load()).administrators.some(name => name.toLowerCase() === login.toLowerCase()))
      return
    const body = typeof row.body === 'string' ? row.body : ''
    const answers = new Map<string, string>()
    const conflicts = new Set<string>()
    let fenced = false
    for (const line of body.split(/\r?\n/)) {
      if (/^\s*~{3}|^\s*```/.test(line)) {
        fenced = !fenced
        continue
      }
      if (fenced)
        continue
      if (!/^answer[ \t]/i.test(line))
        continue
      const content = line.slice(7).trim()
      const separator = content.indexOf(': ')
      if (separator < 1)
        continue
      const id = content.slice(0, separator).trim()
      const answer = content.slice(separator + 2).trim()
      if (!answer || /\s/.test(id))
        continue
      if (answers.has(id) && answers.get(id) !== answer)
        conflicts.add(id)
      answers.set(id, answer)
    }
    for (const [id, answer] of answers) {
      if (conflicts.has(id))
        continue
      const ask = await db.inbox.findById(id)
      if (!ask || ask.kind !== 'ask' || ask.type !== 'user' || ask.status !== 'pending' || timestamp(row.created_at ?? row.submitted_at) < ask.createdAt)
        continue
      const trigger = ask.triggerId && await db.trigger.findById(ask.triggerId)
      if (!trigger || trigger.threadId !== thread.id || (ask.threadId && ask.threadId !== thread.id))
        continue
      const target = parseResource(thread.url!)
      const receipt = await this.state<Receipt>(target.repository, `comment:${id}`)
      if (!receipt)
        continue
      if (ask.ticketId) {
        const ticket = await db.ticket.findById(ask.ticketId)
        if (!ticket || ['done', 'cancelled'].includes(ticket.status))
          continue
      }
      await db.inbox.answerByUser(id, answer, now())
    }
  }

  async publish(inboxId: string, signal?: AbortSignal): Promise<DeliveryResult> {
    return this.exclusive(`publish:${inboxId}`, async () => {
      const row = await db.inbox.findById(inboxId)
      const trigger = row?.triggerId ? await db.trigger.findById(row.triggerId) : undefined
      const key = trigger ? trigger.threadId : inboxId
      const previous = this.publishing.get(key) ?? Promise.resolve()
      const task = previous.then(() => this.publishOne(inboxId, signal))
      const barrier = task.then(() => undefined, () => undefined)
      this.publishing.set(key, barrier)
      try {
        return await task
      }
      finally {
        if (this.publishing.get(key) === barrier)
          this.publishing.delete(key)
      }
    })
  }

  private async destination(row: Inbox): Promise<{ thread: Thread, target: Resource }> {
    if (row.type !== 'user' || !['notice', 'ask'].includes(row.kind) || !row.triggerId)
      throw new GhError('invalid_delivery')
    const trigger = await db.trigger.findById(row.triggerId)
    const thread = trigger && await db.thread.findById(trigger.threadId)
    if (!thread?.url || thread.channelId !== 'github' || !['issue', 'pull'].includes(thread.kind) || (row.threadId && row.threadId !== thread.id))
      throw new GhError('no_reply_address')
    const target = parseResource(thread.url)
    const project = await this.projectForRepository(target.repository)
    if (!project)
      throw new GhError('unknown_repository')
    if (row.ticketId) {
      const ticket = await db.ticket.findById(row.ticketId)
      if (row.kind === 'ask' && ticket && ['done', 'cancelled'].includes(ticket.status))
        throw new GhError('delivery_superseded')
      if (!ticket || ticket.projectId !== project.id)
        throw new GhError('scope_denied')
      if (ticket.paused)
        throw new GhError('human_paused')
      if (!(await db.ticketThread.listTicketIds(thread.id)).includes(ticket.id))
        throw new GhError('unsubscribed_thread')
    }
    return { thread, target }
  }

  private async publishOne(inboxId: string, signal?: AbortSignal): Promise<DeliveryResult> {
    let row = await db.inbox.findById(inboxId)
    if (!row)
      return { ok: false, reason: 'unknown_delivery' }
    if (row.status === 'done')
      return { ok: true }
    let posting = false
    try {
      const { thread, target } = await this.destination(row)
      const project = (await this.projectForRepository(target.repository))!
      const environment = await this.verifyEnvironment(project.id, signal)
      const marker = `<!-- nexus:${row.id} -->`
      const receipt = await this.state<Receipt>(target.repository, `comment:${row.id}`)
      if (receipt) {
        if (receipt.providerId !== environment.providerId || receipt.marker !== marker)
          throw new GhError('managed_comment_mismatch')
        if (row.kind === 'notice')
          await db.inbox.markDone(row.id, now())
        return { ok: true, remoteId: receipt.remoteId }
      }
      if (row.nextRetryAt && row.nextRetryAt > now())
        return { ok: false, reason: 'retry_pending' }
      for (const previous of await db.inbox.listOutgoing()) {
        if (previous.id === row.id || previous.seq >= row.seq || previous.ticketId !== row.ticketId || previous.status === 'done')
          continue
        const priorThread = previous.threadId ?? (previous.triggerId ? (await db.trigger.findById(previous.triggerId))?.threadId : undefined)
        if (priorThread === thread.id && !(await this.state<Receipt>(target.repository, `comment:${previous.id}`)))
          return { ok: false, reason: 'earlier_delivery_pending' }
      }
      const root = `repos/${target.repository}/issues/${target.number}/comments`
      const comments = await this.pages(root, signal)
      const existing = comments.filter(comment => record(comment.user).id != null && identity(record(comment.user).id) === environment.providerId && typeof comment.body === 'string' && comment.body.includes(marker))
      if (existing.length > 1)
        throw new GhError('ambiguous_delivery')
      let remote = existing[0]
      if (!remote) {
        if (row.status === 'stalled' || row.deliveryError === 'publishing') {
          await db.inbox.markStalled(row.id, 'transport_unknown')
          return { ok: false, reason: 'transport_unknown' }
        }
        const current = await db.inbox.findById(row.id)
        if (!current || current.status !== 'pending' || current.type !== row.type || current.kind !== row.kind)
          return { ok: false, reason: 'delivery_superseded' }
        await this.destination(current)
        await db.inbox.recordDeliveryFailure(row.id, 'publishing', now())
        posting = true
        const body = row.kind === 'ask' ? `${row.message}\n\n问题编号：${row.id}\n请回复：answer ${row.id}: 你的回答` : row.message
        remote = record(await this.request(root, signal, 'POST', { body: `${body}\n\n${marker}` }))
      }
      if (identity(record(remote.user).id) !== environment.providerId || !text(remote.body).includes(marker))
        throw new GhError('managed_comment_mismatch')
      const remoteTarget = parseResource(text(remote.html_url))
      if (remoteTarget.repository !== target.repository || remoteTarget.number !== target.number)
        throw new GhError('managed_comment_mismatch')
      const result = { remoteId: identity(remote.id), providerId: environment.providerId, marker, url: text(remote.html_url) }
      await this.save(target.repository, `comment:${row.id}`, result)
      await db.inbox.resetDelivery(row.id)
      if (row.kind === 'notice')
        await db.inbox.markDone(row.id, now())
      return { ok: true, remoteId: result.remoteId }
    }
    catch (error) {
      const reason = failure(error)
      if (posting && !['rate_limited', 'forbidden', 'not_found', 'not_logged_in', 'remote_rejected'].includes(reason)) {
        await db.inbox.markStalled(row.id, 'transport_unknown')
      }
      else if (!['human_paused', 'project_disabled', 'channel_disabled', 'retry_pending'].includes(reason)) {
        row = (await db.inbox.findById(row.id))!
        const settings = await setting.load()
        const attempts = row.deliveryAttempts + (posting ? 0 : 1)
        if (attempts >= settings.deliveryMaxAttempts) {
          await db.inbox.markStalled(row.id, reason)
        }
        else {
          const seconds = Math.max(error instanceof GhError ? error.retryAfterSeconds ?? 0 : 0, Math.min(settings.deliveryRetryCeilingSeconds, 2 ** Math.max(1, attempts)))
          const nextRetryAt = new Date(Date.now() + seconds * 1000).toISOString()
          if (posting)
            await db.inbox.update(row.id, { deliveryError: reason, nextRetryAt })
          else
            await db.inbox.recordDeliveryFailure(row.id, reason, nextRetryAt)
        }
      }
      if (signal?.aborted)
        throw error
      return { ok: false, reason: posting && reason === 'interrupted' ? 'transport_unknown' : reason }
    }
  }

  async flush(signal?: AbortSignal): Promise<({ id: string } & DeliveryResult)[]> {
    signal?.throwIfAborted()
    if (!(await db.channel.findById('github'))?.enabled)
      return []
    const results = []
    for (const row of await db.inbox.listOutgoing()) {
      signal?.throwIfAborted()
      if (row.status !== 'pending')
        continue
      const trigger = row.triggerId && await db.trigger.findById(row.triggerId)
      if (trigger && trigger.channelId === 'github')
        results.push({ id: row.id, ...await this.publish(row.id, signal) })
    }
    return results
  }
}

export const github = new GitHubChannel()

function repositoryOf(remoteUrl: string | null): string | null {
  if (!remoteUrl)
    return null
  const ssh = /^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(remoteUrl)
  if (ssh)
    return ssh[1]!.toLowerCase()
  try {
    const url = new URL(remoteUrl)
    if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname !== 'github.com' || url.password || url.search || url.hash || url.port)
      return null
    const match = /^\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(url.pathname)
    return match?.[1]?.toLowerCase() ?? null
  }
  catch { return null }
}

function parseResource(resource: string): Resource {
  const short = /^github:([^/:]+\/[^/:]+):(issue|pull):([1-9]\d*)$/.exec(resource)
  if (short)
    return { repository: short[1]!.toLowerCase(), kind: short[2] as 'issue' | 'pull', number: Number(short[3]) }
  let url: URL
  try {
    url = new URL(resource)
  }
  catch { throw new GhError('invalid_resource') }
  const match = /^\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/([1-9]\d*)\/?$/i.exec(url.pathname)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || !match)
    throw new GhError('invalid_resource')
  return { repository: match[1]!.toLowerCase(), kind: match[2] === 'pull' ? 'pull' : 'issue', number: Number(match[3]) }
}

function validateTopic(row: Record<string, unknown>, target: Resource): void {
  const url = parseResource(text(row.html_url))
  if (number(row.number) !== target.number || url.repository !== target.repository || url.kind !== target.kind)
    throw new GhError('source_repository_mismatch')
}

function item(row: Record<string, unknown>, kind: ChannelItem['kind']): ChannelItem {
  return { id: identity(row.id), kind, actor: text(record(row.user).login), body: typeof row.body === 'string' ? row.body : typeof row.state === 'string' ? row.state : '', url: text(row.html_url), createdAt: timestamp(row.created_at ?? row.submitted_at), updatedAt: timestamp(row.updated_at ?? row.submitted_at ?? row.created_at) }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GhError('invalid_response')
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new GhError('invalid_response')
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new GhError('invalid_response')
  return value
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new GhError('invalid_response')
  return value
}
function identity(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return String(value)
  if (typeof value === 'string' && value)
    return value
  throw new GhError('invalid_response')
}
function timestamp(value: unknown): string {
  const date = new Date(text(value))
  if (!Number.isFinite(date.getTime()))
    throw new GhError('invalid_response')
  return date.toISOString()
}
function now(): string {
  return new Date().toISOString()
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function failure(error: unknown): string {
  return error instanceof GhError ? error.code : error instanceof Error && error.name === 'AbortError' ? 'interrupted' : 'transport_unknown'
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function commentIssueNumber(issueUrl: unknown, repository: string): number | null {
  const match = typeof issueUrl === 'string' && /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)$/.exec(issueUrl)
  const number = match ? Number(match[2]) : NaN
  if (!match || match[1]!.toLowerCase() !== repository || !Number.isSafeInteger(number))
    return null
  return number
}
