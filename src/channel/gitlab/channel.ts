import type { Selectable } from 'kysely'
import type { DB } from '../../database/types'
import type { ChannelItem, DeliveryResult, GitLabRunner, ReadResult } from './types'
import { createHash } from 'node:crypto'
import { db } from '../../database'
import { project as projects } from '../../service/project'
import { setting } from '../../service/setting'
import { FetchGitLabRunner, GitLabError, gitlabSite } from './runner'

type Thread = Selectable<DB['thread']>
type Inbox = Selectable<DB['inbox']>
interface Resource { site: string, repository: string, number: number, kind: 'issue' | 'pull' }
interface Identity { providerId: string, login: string, repositoryId: string }
interface Cursor { since: string, signature?: string, through?: string }
interface Receipt { remoteId: string, providerId: string, marker: string, url: string }

export class GitLabChannel {
  private readonly operations = new Map<string, Promise<unknown>>()
  private readonly publishing = new Map<string, Promise<void>>()

  constructor(private readonly runner: GitLabRunner = new FetchGitLabRunner()) {}

  private exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    const current = this.operations.get(key)
    if (current)
      return current as Promise<T>
    const task = action().finally(() => this.operations.delete(key))
    this.operations.set(key, task)
    return task
  }

  private async site(): Promise<string> {
    return gitlabSite((await db.channel.findById('gitlab'))?.host ?? null)
  }

  async canonicalResource(resource: string): Promise<string> {
    return resourceUrl(parseResource(resource, await this.site()))
  }

  async canRead(resource: string): Promise<boolean> {
    try {
      await this.canonicalResource(resource)
      return true
    }
    catch { return false }
  }

  private async request(site: string, path: string, signal?: AbortSignal, method: 'GET' | 'POST' = 'GET', body?: Record<string, unknown>): Promise<unknown> {
    signal?.throwIfAborted()
    return this.runner.request({ site, path, method, body, signal })
  }

  private async state<T>(repository: string, name: string): Promise<T | undefined> {
    const row = await db.sourceState.find('gitlab', `${repository}:${name}`)
    return row ? JSON.parse(row.value) as T : undefined
  }

  private async save(repository: string, name: string, value: unknown): Promise<void> {
    await db.sourceState.set('gitlab', `${repository}:${name}`, JSON.stringify(value), now())
  }

  private async project(projectId: string) {
    const project = (await projects.list()).find(project => project.id === projectId)
    if (!project || !remoteGitlab(project.remoteUrl, await this.site()))
      throw new GitLabError('unknown_repository')
    if (!project.enabled)
      throw new GitLabError('project_disabled')
    if (project.available === false)
      throw new GitLabError('project_unavailable')
    return project
  }

  private async projectForRepository(repository: string) {
    const site = await this.site()
    const matches = (await projects.list()).filter((project) => {
      const remote = remoteGitlab(project.remoteUrl, site)
      return remote && source(remote) === repository && project.available !== false
    })
    if (matches.length !== 1)
      throw new GitLabError(matches.length ? 'ambiguous_repository' : 'unknown_repository')
    return matches[0]!
  }

  async verifyEnvironment(projectId: string, signal?: AbortSignal): Promise<Identity> {
    const project = await this.project(projectId)
    const channel = await db.channel.findById('gitlab')
    if (!channel?.enabled)
      throw new GitLabError('channel_disabled')
    const site = gitlabSite(channel.host)
    const target = remoteGitlab(project.remoteUrl, site)!
    const bots = (await db.channelAccount.findByRole('gitlab', 'bot')).filter(account => account.status === 'online')
    const account = record(await this.request(site, 'user', signal))
    const providerId = identity(account.id)
    const login = text(account.username)
    if (!bots.some(bot => bot.name.toLowerCase() === login.toLowerCase()) || (account.state !== undefined && account.state !== 'active'))
      throw new GitLabError('account_mismatch')
    const remote = record(await this.request(site, `projects/${encodeURIComponent(target.repository)}`, signal))
    if (text(remote.path_with_namespace) !== target.repository || source(remoteGitlab(text(remote.web_url), site) ?? { site: '', repository: '' }) !== source(target))
      throw new GitLabError('repository_mismatch')
    const result = { providerId, login, repositoryId: identity(remote.id) }
    const previous = await this.state<Identity>(source(target), 'verified_environment')
    if (previous && (previous.providerId !== providerId || previous.repositoryId !== result.repositoryId))
      throw new GitLabError('environment_identity_changed')
    await this.save(source(target), 'verified_environment', result)
    return result
  }

  private async pages(site: string, path: string, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
    const result: Record<string, unknown>[] = []
    for (let page = 1; ; page++) {
      const value = await this.request(site, `${path + (path.includes('?') ? '&' : '?')}per_page=100&page=${page}`, signal)
      const batch = array(value).map(record)
      result.push(...batch)
      if (batch.length < 100)
        return result
    }
  }

  async read(resource: string, offset = 0, limit = 50, signal?: AbortSignal): Promise<ReadResult> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new GitLabError('invalid_pagination')
    const target = parseResource(resource, await this.site())
    const project = await this.projectForRepository(source(target))
    await this.verifyEnvironment(project.id, signal)
    const main = record(await this.request(target.site, apiRoot(target), signal))
    validateTopic(main, target)
    const notes = await this.pages(target.site, `${apiRoot(target)}/notes?sort=asc&order_by=updated_at`, signal)
    const items = [item(main, target.kind, target), ...notes.map(row => item(row, 'comment', target)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))]
    return { items: items.slice(offset, offset + limit), next_offset: offset + limit < items.length ? offset + limit : null, next_resource: null }
  }

  async collectAll(signal?: AbortSignal): Promise<{ projectId: string, ok: boolean, reason?: string }[]> {
    signal?.throwIfAborted()
    if (!(await db.channel.findById('gitlab'))?.enabled)
      return []
    const site = await this.site()
    const results = []
    for (const project of await projects.list()) {
      signal?.throwIfAborted()
      if (!project.enabled || project.available === false || !remoteGitlab(project.remoteUrl, site))
        continue
      results.push({ projectId: project.id, ...await this.collect(project.id, signal) })
    }
    return results
  }

  async collect(projectId: string, signal?: AbortSignal): Promise<{ ok: boolean, reason?: string }> {
    return this.exclusive(`collect:${projectId}`, async () => {
      const errors: string[] = []
      try {
        const project = await this.project(projectId)
        await this.verifyEnvironment(projectId, signal)
        const target = remoteGitlab(project.remoteUrl, await this.site())!
        const repository = source(target)
        const baseline = await this.state<string>(repository, 'baseline') ?? now()
        await this.save(repository, 'baseline', baseline)
        for (const kind of ['issue', 'pull'] as const) {
          try {
            await this.stream(repository, kind, target.site, `projects/${encodeURIComponent(target.repository)}/${kind === 'issue' ? 'issues' : 'merge_requests'}?state=all&scope=all&order_by=updated_at&sort=asc`, async (row) => {
              const resource: Resource = { ...target, kind, number: number(row.iid) }
              validateTopic(row, resource)
              const thread = await this.ensureThread(resource, row)
              await this.ingest(thread, row, row.state === 'closed' || row.state === 'merged' ? 'close' : 'open', baseline, kind)
            }, signal)
          }
          catch (error) {
            if (signal?.aborted)
              throw error
            errors.push(failure(error))
          }
        }
        for (const thread of await db.thread.listByChannel('gitlab')) {
          if (!thread.url || !['issue', 'pull'].includes(thread.kind))
            continue
          try {
            const resource = parseResource(thread.url, target.site)
            if (source(resource) !== repository)
              continue
            await this.stream(repository, `notes:${resource.kind}:${resource.number}`, target.site, `${apiRoot(resource)}/notes?sort=asc&order_by=updated_at`, async (row) => {
              validateNote(row, resource)
              await this.acceptAnswers(thread, row)
              await this.ingest(thread, row, 'comment', baseline, 'note')
            }, signal)
          }
          catch (error) {
            if (signal?.aborted)
              throw error
            errors.push(failure(error))
          }
        }
      }
      catch (error) {
        if (signal?.aborted)
          throw error
        errors.push(failure(error))
      }
      return errors.length ? { ok: false, reason: [...new Set(errors)].join(',') } : { ok: true }
    })
  }

  private async stream(repository: string, name: string, site: string, path: string, accept: (row: Record<string, unknown>) => Promise<void>, signal?: AbortSignal): Promise<void> {
    const cursor = await this.state<Cursor>(repository, `cursor:${name}`) ?? { since: '1970-01-01T00:00:00.000Z' }
    const startedAt = now()
    const rows = await this.pages(site, path, signal)
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
    await this.save(repository, `cursor:${name}`, cursor.signature === signature && cursor.through ? { since: cursor.through } : { since: cursor.since, signature, through: startedAt })
  }

  private async ensureThread(target: Resource, row: Record<string, unknown>): Promise<Thread> {
    const refId = `${source(target)}:${target.kind}:${target.number}`
    const existing = await db.thread.findByRef('gitlab', refId)
    return db.thread.record({ id: existing?.id ?? `gitlab:${refId}`, channelId: 'gitlab', refId, kind: target.kind, title: text(row.title), url: text(row.web_url), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), projectId: null, triage: 'pending', triagedAt: null })
  }

  private async ingest(thread: Thread, row: Record<string, unknown>, kind: 'open' | 'comment' | 'close', baseline: string, sourceKind: string): Promise<void> {
    const author = record(row.author)
    const actorName = text(author.username)
    const accounts = await db.channelAccount.findByChannel('gitlab')
    const bots = accounts.filter(account => account.role === 'bot')
    const human = author.bot !== true && row.system !== true && !bots.some(bot => bot.name.toLowerCase() === actorName.toLowerCase())
    const body = typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : typeof row.state === 'string' ? row.state : ''
    const mentioned = bots.some(bot => new RegExp(`(?:^|[^a-z0-9_@])@${escapeRegex(bot.name)}(?![a-z0-9_.-])`, 'i').test(body))
    const at = timestamp(row.updated_at ?? row.created_at)
    const id = `${thread.id}:${sourceKind}:${identity(row.id)}:${digest({ body, at, state: row.state }).slice(0, 16)}`
    const url = sourceKind === 'note' ? `${thread.url}#note_${identity(row.id)}` : text(row.web_url)
    await db.trigger.ingest({ id, channelId: 'gitlab', threadId: thread.id, kind, actorName, human: Number(human), mentioned: Number(mentioned), text: body, url, at, ref: typeof row.source_branch === 'string' ? row.source_branch : null })
    const subscriptions = await db.ticketThread.listTicketIds(thread.id)
    const historical = timestamp(row.created_at) < baseline
    const admin = (await setting.load()).administrators.some(name => name.toLowerCase() === actorName.toLowerCase())
    if (!human || (historical && !subscriptions.length))
      return
    if (!subscriptions.length && (!admin || (kind !== 'open' && !mentioned) || (thread.triage === 'ignored' && !mentioned)))
      return
    const targets = new Map<string, { projectId: string | null, ticketId: string | null }>()
    for (const ticketId of subscriptions) {
      const ticket = await db.ticket.findById(ticketId)
      if (ticket && !['done', 'cancelled'].includes(ticket.status))
        targets.set(ticket.projectId, { projectId: ticket.projectId, ticketId })
    }
    if (!subscriptions.length)
      targets.set(thread.projectId ?? 'main', { projectId: thread.triage === 'claimed' ? thread.projectId : null, ticketId: null })
    for (const [key, target] of targets)
      await db.inbox.enqueue({ id: `${id}:inbox:${key}`, type: target.projectId ? 'project' : 'main', origin: 'channel', kind: 'trigger', message: body, title: thread.title, projectId: target.projectId, ticketId: target.ticketId, triggerId: id, threadId: thread.id })
  }

  private async acceptAnswers(thread: Thread, row: Record<string, unknown>): Promise<void> {
    const author = record(row.author)
    const login = text(author.username)
    const accounts = await db.channelAccount.findByChannel('gitlab')
    if (author.bot === true || row.system === true || accounts.some(account => account.role === 'bot' && account.name.toLowerCase() === login.toLowerCase()) || !(await setting.load()).administrators.some(name => name.toLowerCase() === login.toLowerCase()))
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
      const target = parseResource(thread.url!, await this.site())
      const receipt = await this.state<Receipt>(source(target), `comment:${id}`)
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
      throw new GitLabError('invalid_delivery')
    const trigger = await db.trigger.findById(row.triggerId)
    const thread = trigger && await db.thread.findById(trigger.threadId)
    if (!thread?.url || thread.channelId !== 'gitlab' || !['issue', 'pull'].includes(thread.kind) || (row.threadId && row.threadId !== thread.id))
      throw new GitLabError('no_reply_address')
    const target = parseResource(thread.url, await this.site())
    const project = await this.projectForRepository(source(target))
    if (!project)
      throw new GitLabError('unknown_repository')
    if (row.ticketId) {
      const ticket = await db.ticket.findById(row.ticketId)
      if (row.kind === 'ask' && ticket && ['done', 'cancelled'].includes(ticket.status))
        throw new GitLabError('delivery_superseded')
      if (!ticket || ticket.projectId !== project.id)
        throw new GitLabError('scope_denied')
      if (ticket.paused)
        throw new GitLabError('human_paused')
      if (!(await db.ticketThread.listTicketIds(thread.id)).includes(ticket.id))
        throw new GitLabError('unsubscribed_thread')
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
      const project = (await this.projectForRepository(source(target)))!
      const environment = await this.verifyEnvironment(project.id, signal)
      const marker = `<!-- nexus:${row.id} -->`
      const receipt = await this.state<Receipt>(source(target), `comment:${row.id}`)
      if (receipt) {
        if (receipt.providerId !== environment.providerId || receipt.marker !== marker)
          throw new GitLabError('managed_comment_mismatch')
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
        if (priorThread === thread.id && !(await this.state<Receipt>(source(target), `comment:${previous.id}`)))
          return { ok: false, reason: 'earlier_delivery_pending' }
      }
      const root = `${apiRoot(target)}/notes`
      const comments = await this.pages(target.site, root, signal)
      const existing = comments.filter(comment => record(comment.author).id != null && identity(record(comment.author).id) === environment.providerId && typeof comment.body === 'string' && comment.body.includes(marker))
      if (existing.length > 1)
        throw new GitLabError('ambiguous_delivery')
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
        remote = record(await this.request(target.site, root, signal, 'POST', { body: `${body}\n\n${marker}` }))
      }
      if (identity(record(remote.author).id) !== environment.providerId || !text(remote.body).includes(marker))
        throw new GitLabError('managed_comment_mismatch')
      validateNote(remote, target)
      const result = { remoteId: identity(remote.id), providerId: environment.providerId, marker, url: `${resourceUrl(target)}#note_${identity(remote.id)}` }
      await this.save(source(target), `comment:${row.id}`, result)
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
      else if (!['human_paused', 'project_disabled', 'project_unavailable', 'channel_disabled', 'retry_pending'].includes(reason)) {
        row = (await db.inbox.findById(row.id))!
        const settings = await setting.load()
        const attempts = row.deliveryAttempts + (posting ? 0 : 1)
        if (attempts >= settings.deliveryMaxAttempts) {
          await db.inbox.markStalled(row.id, reason)
        }
        else {
          const seconds = Math.max(error instanceof GitLabError ? error.retryAfterSeconds ?? 0 : 0, Math.min(settings.deliveryRetryCeilingSeconds, 2 ** Math.max(1, attempts)))
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
    if (!(await db.channel.findById('gitlab'))?.enabled)
      return []
    const results = []
    for (const row of await db.inbox.listOutgoing()) {
      signal?.throwIfAborted()
      if (row.status !== 'pending')
        continue
      const trigger = row.triggerId && await db.trigger.findById(row.triggerId)
      if (trigger && trigger.channelId === 'gitlab')
        results.push({ id: row.id, ...await this.publish(row.id, signal) })
    }
    return results
  }
}

export const gitlab = new GitLabChannel()

export function remoteGitlab(remoteUrl: string | null, host: string): { site: string, repository: string } | null {
  if (!remoteUrl)
    return null
  const site = gitlabSite(host)
  const configured = new URL(site)
  const scp = /^git@([^/:]+):(.+)$/.exec(remoteUrl)
  if (scp) {
    if (scp[1]!.toLowerCase() !== configured.hostname || configured.port)
      return null
    const repository = repositoryPath(scp[2]!.replace(/\.git$/, ''))
    return repository ? { site, repository } : null
  }
  try {
    const url = new URL(remoteUrl)
    if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname !== configured.hostname || url.password || url.search || url.hash || (url.protocol === 'https:' ? url.origin !== site || Boolean(url.username) : Boolean(url.port) || Boolean(url.username && url.username !== 'git')))
      return null
    const repository = repositoryPath(url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, ''))
    return repository ? { site, repository } : null
  }
  catch { return null }
}

function repositoryPath(value: string): string | null {
  const segments = value.split('/')
  return segments.length >= 2 && segments.every(segment => /^\w[\w.-]*$/.test(segment) && segment !== '.' && segment !== '..') ? value : null
}

function parseResource(resource: string, site: string): Resource {
  const short = /^gitlab:([^:]+):(issue|pull|mr):([1-9]\d*)$/.exec(resource)
  if (short) {
    const repository = repositoryPath(short[1]!)
    const number = Number(short[3])
    if (repository && Number.isSafeInteger(number))
      return { site, repository, kind: short[2] === 'issue' ? 'issue' : 'pull', number }
    throw new GitLabError('invalid_resource')
  }
  let url: URL
  try {
    url = new URL(resource.startsWith('gitlab/') ? `${site}/${resource.slice(7)}` : resource)
  }
  catch { throw new GitLabError('invalid_resource') }
  const match = /^\/(.+)\/-\/(issues|merge_requests)\/([1-9]\d*)\/?$/.exec(url.pathname)
  const repository = match && repositoryPath(match[1]!)
  const number = Number(match?.[3])
  if (url.origin !== site || url.protocol !== 'https:' || url.username || url.password || url.search || (url.hash && !/^#note_[1-9]\d*$/.test(url.hash)) || !repository || !Number.isSafeInteger(number))
    throw new GitLabError('invalid_resource')
  return { site, repository, kind: match![2] === 'issues' ? 'issue' : 'pull', number }
}

function source(target: { site: string, repository: string }): string {
  return `${target.site}/${target.repository}`
}

function resourceUrl(target: Resource): string {
  return `${source(target)}/-/${target.kind === 'issue' ? 'issues' : 'merge_requests'}/${target.number}`
}

function apiRoot(target: Resource): string {
  return `projects/${encodeURIComponent(target.repository)}/${target.kind === 'issue' ? 'issues' : 'merge_requests'}/${target.number}`
}

function validateTopic(row: Record<string, unknown>, target: Resource): void {
  const remote = parseResource(text(row.web_url), target.site)
  if (number(row.iid) !== target.number || resourceUrl(remote) !== resourceUrl(target))
    throw new GitLabError('source_repository_mismatch')
}

function validateNote(row: Record<string, unknown>, target: Resource): void {
  identity(row.id)
  if (row.noteable_iid !== undefined && number(row.noteable_iid) !== target.number)
    throw new GitLabError('source_repository_mismatch')
  if (row.noteable_type !== undefined && row.noteable_type !== (target.kind === 'issue' ? 'Issue' : 'MergeRequest'))
    throw new GitLabError('source_repository_mismatch')
  if (row.web_url !== undefined && resourceUrl(parseResource(text(row.web_url), target.site)) !== resourceUrl(target))
    throw new GitLabError('source_repository_mismatch')
}

function item(row: Record<string, unknown>, kind: ChannelItem['kind'], target: Resource): ChannelItem {
  if (kind === 'comment')
    validateNote(row, target)
  return { id: identity(row.id), kind, actor: text(record(row.author).username), body: typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : typeof row.state === 'string' ? row.state : '', url: kind === 'comment' ? `${resourceUrl(target)}#note_${identity(row.id)}` : text(row.web_url), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at ?? row.created_at) }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GitLabError('invalid_response')
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new GitLabError('invalid_response')
  return value
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new GitLabError('invalid_response')
  return value
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new GitLabError('invalid_response')
  return value
}
function identity(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return String(value)
  if (typeof value === 'string' && value)
    return value
  throw new GitLabError('invalid_response')
}
function timestamp(value: unknown): string {
  const date = new Date(text(value))
  if (!Number.isFinite(date.getTime()))
    throw new GitLabError('invalid_response')
  return date.toISOString()
}
function now(): string {
  return new Date().toISOString()
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function failure(error: unknown): string {
  return error instanceof GitLabError ? error.code : error instanceof Error && error.name === 'AbortError' ? 'interrupted' : 'transport_unknown'
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
