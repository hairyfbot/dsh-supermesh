import type { Selectable } from 'kysely'
import type { DB } from '../../database/types'
import type { ChannelItem, DeliveryResult, GitLabRunner, ReadResult } from './types'
import { createHash } from 'node:crypto'
import { db } from '../../database'
import { singlet } from '../../runtime/singlet'
import { project as projects } from '../../service/project'
import { setting } from '../../service/setting'
import { FetchGitLabRunner, GitLabError, gitlabSite } from './runner'

type Thread = Selectable<DB['thread']>
type Inbox = Selectable<DB['inbox']>
interface Resource { site: string, repository: string, number: number, kind: 'issue' | 'pull' }
interface Identity { providerId: string, login: string, repositoryId: string }
interface Cursor { since: string, signature?: string, through?: string, etag?: string | null }
interface Receipt { remoteId: string, providerId: string, marker: string, url: string }

export class GitLabChannel {
  private readonly publishing = new Map<string, Promise<void>>()

  constructor(private readonly runner: GitLabRunner = new FetchGitLabRunner()) {}

  private exclusive<T>(key: string, action: () => Promise<T>): Promise<T> {
    return singlet(`gitlab:exclusive:${key}`, action)()
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

  private async request(site: string, path: string, signal?: AbortSignal, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: Record<string, unknown>): Promise<unknown> {
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

  private async requestValue(site: string, path: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<{ body: unknown, etag: string | null, notModified: boolean }> {
    const value = await this.runner.request({ site, method: 'GET', path, withEtag: true, ...(headers ? { headers } : {}), ...(signal ? { signal } : {}) }) as { body?: unknown, etag?: string | null, notModified?: boolean } | null
    return { body: value?.body ?? null, etag: value?.etag ?? null, notModified: value?.notModified === true }
  }

  private async pages(site: string, path: string, signal?: AbortSignal, since?: string, etag?: string): Promise<{ rows: Record<string, unknown>[], etag: string | null, notModified: boolean }> {
    const result: Record<string, unknown>[] = []
    // 只有 issues / merge_requests 这类顶层列表支持 updated_after；notes、pipelines 传它会被拒。
    const supports = since && /\/projects\/[^/]+\/(?:issues|merge_requests)(?:\?|$)/.test(path)
    const stamp = supports ? `&updated_after=${encodeURIComponent(since)}` : ''
    let latest: string | null = null
    for (let page = 1; ; page++) {
      const url = `${path + (path.includes('?') ? '&' : '?')}per_page=100&page=${page}${stamp}`
      // 只在第一页带条件头；ETag 对应整个列表的表示，翻到第二页就不再适用。
      const headers = page === 1 && etag ? { 'if-none-match': etag } : undefined
      const value = await this.requestValue(site, url, signal, headers)
      if (page === 1 && value.notModified)
        return { rows: [], etag: value.etag ?? etag ?? null, notModified: true }
      if (page === 1)
        latest = value.etag
      const batch = array(value.body).map(record)
      result.push(...batch)
      if (batch.length < 100)
        return { rows: result, etag: latest, notModified: false }
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
    const notes = (await this.pages(target.site, `${apiRoot(target)}/notes?sort=asc&order_by=updated_at`, signal)).rows
    const items = [item(main, target.kind, target), ...notes.map((row: Record<string, unknown>) => item(row, 'comment', target)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))]
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
      results.push({ projectId: project.id, ...await this.collect(project.id, signal).then((result) => {
        if (!result.ok)
          console.error(`[gitlab:collect] ${project.name} ${project.remoteUrl} -> ${result.reason}`)
        return result
      }) })
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
              if (kind === 'pull')
                await this.observeMergeRequest(projectId, thread, row)
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
          if (!await polled(thread))
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
        const branch = await this.defaultBranch(target.site, target.repository, signal)
        if (branch) {
          await this.collectBranch(projectId, branch, signal).catch((error) => {
            errors.push(`ci:${failure(error)}`)
          })
        }
        // MR 的 pipeline 跑在源分支上，默认分支永远看不到它 —— 这正是代码托管流程里最该盯的 CI。
        for (const ref of await this.activeBranches(target.site, target.repository, signal)) {
          if (ref === branch)
            continue
          await this.collectBranch(projectId, ref, signal).catch((error) => {
            errors.push(`ci:${failure(error)}`)
          })
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
    const page = await this.pages(site, path, signal, cursor.since, cursor.etag ?? undefined)
    // 304：远端表示没变，游标与签名都用不着更新，直接按无新增处理。
    if (page.notModified)
      return
    const rows = page.rows
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
    // since 推进到本次读取起点前 5 秒：只在数据未变时推进会让持续有更新的仓库永久漏采，
    // 重叠区靠确定性 trigger id 去重（与官方 cursorAt 一致）。
    await this.save(repository, `cursor:${name}`, { since: cursorAt(startedAt), signature, through: startedAt, etag: page.etag })
  }

  /** 活跃 MR 的源分支。只取 opened，已关的不再采 CI。 */
  private async activeBranches(site: string, repository: string, signal?: AbortSignal): Promise<string[]> {
    const path = `projects/${encodeURIComponent(repository)}/merge_requests?state=opened&per_page=100`
    const rows = array(await this.request(site, path, signal)).map(record)
    return [...new Set(rows.map(row => text(row.source_branch)).filter(Boolean))]
  }

  /** 取项目默认分支，用于 CI 采集。 */
  private async defaultBranch(site: string, repository: string, signal?: AbortSignal): Promise<string | null> {
    const row = record(await this.request(site, `projects/${encodeURIComponent(repository)}`, signal))
    const branch = typeof row.default_branch === 'string' ? row.default_branch.trim() : ''
    return branch || null
  }

  /** 采默认分支的 pipeline 状态，变化时给项目编排发触发（对应 GitHub 的 collectBranch）。 */
  async collectBranch(projectId: string, branch: string, signal?: AbortSignal): Promise<void> {
    const project = await this.project(projectId)
    const site = await this.site()
    const target = remoteGitlab(project.remoteUrl, site)
    if (!target)
      return
    const path = `projects/${encodeURIComponent(target.repository)}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1`
    const rows = array(await this.request(site, path, signal)).map(record)
    const latest = rows[0]
    if (!latest)
      return
    const state = text(latest.status)
    const head = text(latest.sha)
    const ref = `${target.repository}:branch:${branch}`
    const { row: watch } = await db.ciWatch.recordRevision({ id: `gitlab:${ref}`, channelId: 'gitlab', kind: 'branch', ref, fingerprint: digest({ state, head }), head, updatedAt: now() })
    if (watch.revision === 0 && ['success', 'skipped', 'manual'].includes(state))
      return
    const threadId = `gitlab:${ref}`
    await db.thread.record({ id: threadId, channelId: 'gitlab', refId: ref, kind: 'ci', title: `CI ${branch}`, url: null, projectId, triage: 'claimed', triagedAt: now(), createdAt: now(), updatedAt: now() })
    const triggerId = `${watch.id}:revision:${watch.revision}`
    const message = `${branch} CI ${state}`
    await db.trigger.ingest({ id: triggerId, channelId: 'gitlab', threadId, kind: 'ci', actorName: null, human: 0, mentioned: 0, text: message, url: text(latest.web_url), at: now(), ref: head })
    await db.inbox.enqueue({ id: `${triggerId}:project:${projectId}`, type: 'project', origin: 'system', kind: 'notice', projectId, triggerId, threadId, title: message, message })
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
    const id = `${thread.id}:${sourceKind}:${identity(row.id)}`
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
      if (!ticket)
        continue
      if (['done', 'cancelled'].includes(ticket.status)) {
        if (!mentioned)
          continue
        if (await db.ticket.reopen(ticketId, at)) {
          await db.worker.queue(ticketId, ticket.projectId)
          targets.set(ticket.projectId, { projectId: ticket.projectId, ticketId })
        }
        continue
      }
      targets.set(ticket.projectId, { projectId: ticket.projectId, ticketId })
    }
    if (!subscriptions.length)
      targets.set(thread.projectId ?? 'main', { projectId: thread.triage === 'claimed' ? thread.projectId : null, ticketId: null })
    for (const [key, target] of targets)
      await db.inbox.enqueue({ id: `${id}:inbox:${key}`, type: target.projectId ? 'project' : 'main', origin: 'channel', kind: 'trigger', message: body, title: thread.title, projectId: target.projectId, ticketId: target.ticketId, triggerId: id, threadId: thread.id })
  }

  private async observeMergeRequest(projectId: string, thread: Thread, row: Record<string, unknown>): Promise<void> {
    const target = parseResource(thread.url!, await this.site())
    if (target.kind !== 'pull')
      return
    validateTopic(row, target)
    const state = row.state === 'merged' ? 'merged' : row.state === 'closed' ? 'closed' : row.state === 'opened' ? 'open' : null
    if (!state)
      throw new GitLabError('invalid_response')
    const branch = typeof row.source_branch === 'string' ? text(row.source_branch) : null
    // 分支反查 Worker 建立绑定：prUrl 只能由这里写入，若要求它已等于 thread.url 才写，
    // 就成环了 —— 永远为空、MR 合并也不会结单。
    const worker = branch ? await db.worker.findByBranch(branch) : undefined
    const owned = worker && await db.ticket.findById(worker.ticketId)
    if (owned?.projectId === projectId && (!owned.prUrl || owned.prUrl === thread.url)) {
      await db.ticketThread.link(owned.id, thread.id, now())
      await db.ticket.setPullRequest(owned.id, thread.url, state, owned.ciState)
    }
    for (const ticketId of await db.ticketThread.listTicketIds(thread.id)) {
      const ticket = await db.ticket.findById(ticketId)
      if (!ticket || ticket.projectId !== projectId || ticket.prUrl !== thread.url || ['done', 'cancelled'].includes(ticket.status))
        continue
      await db.ticket.setPullRequest(ticketId, thread.url, state, ticket.ciState)
    }
    if (state === 'open')
      return
    await this.threadClosed(projectId, thread, state, timestamp(row.merged_at ?? row.closed_at ?? row.updated_at), branch)
  }

  private async threadClosed(projectId: string, thread: Thread, outcome: 'merged' | 'closed', at: string, branch: string | null): Promise<void> {
    const ended = await db.ticket.closeThread(thread.id, outcome, at, branch)
    if (outcome !== 'merged' || !ended.length)
      return
    for (const source of await db.thread.listByChannel('gitlab')) {
      if (source.kind !== 'issue' || source.projectId !== projectId || !source.url)
        continue
      if (!(await db.ticketThread.listTicketIds(source.id)).some(id => ended.includes(id)))
        continue
      let target: Resource
      try {
        target = parseResource(source.url, await this.site())
      }
      catch {
        continue
      }
      if (target.kind !== 'issue')
        continue
      await this.request(target.site, apiRoot(target), undefined, 'PUT', { state_event: 'close' }).catch(() => undefined)
    }
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
      const marker = `<!-- supermesh:${row.id} -->`
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
      const comments = (await this.pages(target.site, root, signal)).rows
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

/** 没有活票的话题，最后一次活动超过这个时长就不再轮询（官方 POLL_HORIZON_MS）。 */
const POLL_HORIZON_MS = 14 * 24 * 3600_000

/**
 * 是否该轮询这个话题（照官方 `poll.ts` 的 `polled`）：
 * 有活票必轮询；否则只在最后一次触发/结单后的 14 天内轮询。
 * 否则每轮都把所有历史话题翻一遍，话题一多就变成 O(n) 阻塞。
 */
async function polled(thread: Selectable<DB['thread']>, at = Date.now()): Promise<boolean> {
  const ticketIds = await db.ticketThread.listTicketIds(thread.id)
  if (!ticketIds.length)
    return true
  const tickets = await Promise.all(ticketIds.map(id => db.ticket.findById(id)))
  if (tickets.some(ticket => ticket && !['done', 'cancelled'].includes(ticket.status)))
    return true
  const times = [thread.updatedAt, ...tickets.map(ticket => ticket?.endedAt ?? '')]
    .map(value => Date.parse(value))
    .filter(Number.isFinite)
  return at - Math.max(...times) < POLL_HORIZON_MS
}

/** 游标回退 5 秒，靠确定性 id 去重，避免远程迟到的事件被漏掉（官方 `cursorAt`）。 */
function cursorAt(started: string): string {
  return new Date(Date.parse(started) - 5000).toISOString()
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
  const match = /^\/(.+)\/-\/(issues|work_items|merge_requests)\/([1-9]\d*)\/?$/.exec(url.pathname)
  const repository = match && repositoryPath(match[1]!)
  const number = Number(match?.[3])
  if (url.origin !== site || url.protocol !== 'https:' || url.username || url.password || url.search || (url.hash && !/^#note_[1-9]\d*$/.test(url.hash)) || !repository || !Number.isSafeInteger(number))
    throw new GitLabError('invalid_resource')
  // GitLab 新版把 issue 的规范地址改成 `/-/work_items/<iid>`，旧地址仍可用；
  // 两者都归到 issue，否则采集会以 invalid_resource 整轮失败。
  return { site, repository, kind: match![2] === 'merge_requests' ? 'pull' : 'issue', number }
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
  if (error instanceof GitLabError)
    return error.code
  if (error instanceof Error)
    return error.name === 'AbortError' ? 'interrupted' : `transport_unknown(${error.message.slice(0, 120)})`
  return 'transport_unknown'
}
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
