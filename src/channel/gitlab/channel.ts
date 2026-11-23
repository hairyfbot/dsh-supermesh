import type { ChannelAdapter, ChannelIdentity, ChannelRow, CollectOutcome, DeliveryResult, ResourceReaded } from '@/channel/_shared/types'
import type { Resource } from '@/channel/gitlab/service/resource.types'
import type { GitLabRunner } from '@/channel/gitlab/types'
import type { CollectContext, Cursor, ProjectRow, ThreadRow } from '@/service/courier.types'
import { array, cursorAt, identity, number, record, text, timestamp } from '@/channel/_shared/primitives'
import { closeThread, recordThread } from '@/channel/_shared/thread'
import { FetchGitLabRunner, GitLabError, gitlabSite } from '@/channel/gitlab/runner'
import { binding } from '@/channel/gitlab/service/binding'
import { ci } from '@/channel/gitlab/service/ci'
import { hosts } from '@/channel/gitlab/service/hosts'
import { mergeRequest } from '@/channel/gitlab/service/merge-request'
import { resource } from '@/channel/gitlab/service/resource'
import { db } from '@/database'
import { courier } from '@/service/courier'
import { project as projects } from '@/service/project'

const INITIAL_CURSOR: Cursor = { since: '1970-01-01T00:00:00.000Z' }

export class GitLabChannel implements ChannelAdapter {
  private readonly ports: ReturnType<typeof binding.of>

  constructor(private readonly runner: GitLabRunner = new FetchGitLabRunner()) {
    this.ports = binding.of(this)
  }

  async site(): Promise<string> {
    await hosts.ready()
    return gitlabSite((await db.channel.findById('gitlab'))?.host ?? null)
  }

  async normalize(value: string): Promise<string> {
    return resource.url(resource.parse(value, await this.site()))
  }

  async readable(value: string): Promise<boolean> {
    try {
      await this.normalize(value)
      return true
    }
    catch { return false }
  }

  async request(site: string, path: string, signal?: AbortSignal, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: Record<string, unknown>): Promise<unknown> {
    signal?.throwIfAborted()
    return this.runner.request({ site, path, method, body, signal })
  }

  async project(projectId: string) {
    const project = (await projects.list()).find(project => project.id === projectId)
    if (!project || !resource.remote(project.remoteUrl, await this.site()))
      throw new GitLabError('unknown_repository')
    if (!project.enabled)
      throw new GitLabError('project_disabled')
    if (project.available === false)
      throw new GitLabError('project_unavailable')
    return project
  }

  async projectForRepository(repository: string) {
    const site = await this.site()
    const matches = (await projects.list()).filter((project) => {
      const remote = resource.remote(project.remoteUrl, site)
      return remote && resource.source(remote) === repository && project.available !== false
    })
    if (matches.length !== 1)
      throw new GitLabError(matches.length ? 'ambiguous_repository' : 'unknown_repository')
    return matches[0]!
  }

  async scopeOf(project: ProjectRow): Promise<string | null> {
    const current = 'available' in project ? project : (await projects.list()).find(row => row.id === project.id)
    if (!current || current.available === false)
      return null
    const target = resource.remote(current.remoteUrl, await this.site())
    return target ? resource.source(target) : null
  }

  async probe(projectId: string, signal?: AbortSignal): Promise<ChannelIdentity> {
    const project = await this.project(projectId)
    const channel = await db.channel.findById('gitlab')
    if (!channel?.enabled)
      throw new GitLabError('channel_disabled')
    const site = gitlabSite(channel.host)
    await hosts.ready()
    const target = resource.remote(project.remoteUrl, site)!
    const bots = (await db.channelAccount.findByRole('gitlab', 'bot')).filter(account => account.status === 'online')
    const account = record(await this.request(site, 'user', signal))
    const providerId = identity(account.id)
    const login = text(account.username)
    if (!bots.some(bot => bot.name.toLowerCase() === login.toLowerCase()) || (account.state !== undefined && account.state !== 'active'))
      throw new GitLabError('account_mismatch')
    const remote = record(await this.request(site, `projects/${encodeURIComponent(target.repository)}`, signal))
    const webUrl = text(remote.web_url)
    // 自建实例常把 API 放在 IP、external_url 用域名：先学下这个网页 host，thread 的 web_url 才解析得出来。
    await hosts.learn(site, webUrl)
    if (text(remote.path_with_namespace) !== target.repository || resource.source(resource.remote(webUrl, site) ?? { site: '', repository: '' }) !== resource.source(target))
      throw new GitLabError('repository_mismatch')
    const result = { providerId, login, repositoryId: identity(remote.id) }
    const previous = await courier.state<ChannelIdentity>('gitlab', resource.source(target), 'verified_environment')
    if (previous && (previous.providerId !== providerId || previous.repositoryId !== result.repositoryId))
      throw new GitLabError('environment_identity_changed')
    await courier.record('gitlab', resource.source(target), 'verified_environment', result)
    return result
  }

  private async requestValue(site: string, path: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<{ body: unknown, etag: string | null, notModified: boolean }> {
    const value = await this.runner.request({ site, method: 'GET', path, withEtag: true, ...(headers ? { headers } : {}), ...(signal ? { signal } : {}) }) as { body?: unknown, etag?: string | null, notModified?: boolean } | null
    return { body: value?.body ?? null, etag: value?.etag ?? null, notModified: value?.notModified === true }
  }

  async pages(site: string, path: string, signal?: AbortSignal, since?: string, etag?: string): Promise<{ rows: ChannelRow[], etag: string | null, notModified: boolean }> {
    // 只有 issues / merge_requests 这类顶层列表支持 updated_after；notes、pipelines 传它会被拒。
    // path 形如 `projects/<repo>/issues?...`，没有前导斜杠，所以这里不能要求 `/projects/`。
    const supports = since && /(?:^|\/)projects\/[^/]+\/(?:issues|merge_requests)(?:\?|$)/.test(path)
    const stamp = supports ? `&updated_after=${encodeURIComponent(since)}` : ''
    return courier.pages(async (page) => {
      const url = `${path + (path.includes('?') ? '&' : '?')}per_page=100&page=${page}${stamp}`
      // 只在第一页带条件头；ETag 对应整个列表的表示，翻到第二页就不再适用。
      const headers = page === 1 && etag ? { 'if-none-match': etag } : undefined
      const value = await this.requestValue(site, url, signal, headers)
      // 304 没有响应体：先判 notModified，否则 array(null) 会把整轮采集打成 invalid_response。
      if (value.notModified)
        return { rows: [], notModified: true, etag: value.etag }
      return { rows: array(value.body).map(record), notModified: false, etag: value.etag }
    })
  }

  async read(value: string, offset = 0, limit = 50, signal?: AbortSignal): Promise<ResourceReaded> {
    const target = resource.parse(value, await this.site())
    const project = await this.projectForRepository(resource.source(target))
    await this.probe(project.id, signal)
    const main = record(await this.request(target.site, resource.apiRoot(target), signal))
    resource.validateTopic(main, target)
    const notes = (await this.pages(target.site, `${resource.apiRoot(target)}/notes?sort=asc&order_by=updated_at`, signal)).rows
    const items = [resource.item(main, target.kind, target), ...notes.map(row => resource.item(row, 'comment', target)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))]
    return { ...courier.page(items, offset, limit), next_resource: null }
  }

  async harvest(signal?: AbortSignal): Promise<CollectOutcome[]> {
    return courier.harvest(this.ports.collect, signal)
  }

  async collect(projectId: string, branch?: string, signal?: AbortSignal): Promise<CollectOutcome> {
    return courier.collect(this.ports.collect, projectId, branch, signal)
  }

  async publish(inboxId: string, signal?: AbortSignal): Promise<DeliveryResult> {
    return courier.publish(this.ports.delivery, inboxId, signal)
  }

  async flush(signal?: AbortSignal): Promise<({ id: string } & DeliveryResult)[]> {
    return courier.flush(this.ports.delivery, signal)
  }

  private advance(_cursor: Cursor, _rows: ChannelRow[], startedAt: string): Cursor {
    // since 推进到本次读取起点前 5 秒：只在数据未变时推进会让持续有更新的仓库永久漏采，
    // 重叠区靠确定性 trigger id 去重（与官方 cursorAt 一致）。
    return { since: cursorAt(startedAt) }
  }

  async collectProject(context: CollectContext, signal?: AbortSignal): Promise<void> {
    const site = await this.site()
    // context.scope 是带站点的来源键（同一实例可能被多个渠道配置指向），API 路径只认 path_with_namespace。
    const scope = context.scope
    const project = await this.project(context.projectId)
    const target = resource.remote(project.remoteUrl, site)
    if (!target)
      throw new GitLabError('unknown_repository')
    const repository = target.repository
    for (const kind of ['issue', 'pull'] as const) {
      await context.attempt(async () => {
        await courier.stream({
          channel: 'gitlab',
          scope,
          name: kind,
          initial: INITIAL_CURSOR,
          read: cursor => this.pages(site, `projects/${encodeURIComponent(repository)}/${kind === 'issue' ? 'issues' : 'merge_requests'}?state=all&scope=all&order_by=updated_at&sort=asc`, signal, cursor.since, cursor.etag ?? undefined),
          advance: (cursor, rows, startedAt) => this.advance(cursor, rows, startedAt),
          accept: async (row) => {
            const resourceTarget: Resource = { site, repository, kind, number: number(row.iid) }
            resource.validateTopic(row, resourceTarget)
            const thread = await this.ensureThread(resourceTarget, row)
            await courier.ingest(this.ports.ingest, thread, row, row.state === 'closed' || row.state === 'merged' ? 'close' : 'open', context.baseline, kind)
            if (kind === 'pull')
              await mergeRequest.observe(this, context.projectId, thread, row)
          },
          signal,
        })
      })
    }
    for (const thread of await db.thread.listByChannel('gitlab')) {
      const url = thread.url
      if (!url || !['issue', 'pull'].includes(thread.kind))
        continue
      const ticketIds = await db.ticketThread.listTicketIds(thread.id)
      if (!await courier.polled(ticketIds, thread.updatedAt))
        continue
      await context.attempt(async () => {
        const threadTarget = resource.parse(url, site)
        if (threadTarget.repository !== repository)
          return
        // 已挂票的 MR 每轮回读一次状态：合并可能发生在挂票之前，采集游标不会回头补。
        if (threadTarget.kind === 'pull' && ticketIds.length) {
          const current = record(await this.request(site, resource.apiRoot(threadTarget), signal))
          await mergeRequest.observe(this, context.projectId, thread, current)
        }
        await courier.stream({
          channel: 'gitlab',
          scope,
          name: `notes:${threadTarget.kind}:${threadTarget.number}`,
          initial: INITIAL_CURSOR,
          read: cursor => this.pages(site, `${resource.apiRoot(threadTarget)}/notes?sort=asc&order_by=updated_at`, signal, cursor.since, cursor.etag ?? undefined),
          advance: (cursor, rows, startedAt) => this.advance(cursor, rows, startedAt),
          accept: async (row) => {
            resource.validateNote(row, threadTarget)
            await courier.answers(this.ports.answer, thread, row)
            await courier.ingest(this.ports.ingest, thread, row, 'comment', context.baseline, 'note')
          },
          signal,
        })
      })
    }
    const branch = await ci.defaultBranch(this, site, repository, signal)
    if (branch)
      await this.ciBranch(context, branch, signal)
    // MR 的 pipeline 跑在源分支上，默认分支永远看不到它 —— 这正是代码托管流程里最该盯的 CI。
    for (const ref of await ci.activeBranches(this, site, repository, signal)) {
      if (ref === branch)
        continue
      await this.ciBranch(context, ref, signal)
    }
  }

  private async ciBranch(context: CollectContext, branch: string, signal?: AbortSignal): Promise<void> {
    try {
      await ci.branch(this, context.projectId, branch, signal)
    }
    catch (error) {
      if (signal?.aborted)
        return
      context.fail(new GitLabError(`ci:${courier.failure(error, true)}`))
    }
  }

  private async ensureThread(target: Resource, row: ChannelRow): Promise<ThreadRow> {
    return recordThread({ channel: 'gitlab', refId: `${resource.source(target)}:${target.kind}:${target.number}`, kind: target.kind, title: text(row.title), url: text(row.web_url), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at) })
  }

  async threadClosed(projectId: string, thread: ThreadRow, outcome: 'merged' | 'closed', at: string): Promise<void> {
    await closeThread({ channel: 'gitlab', projectId, thread, outcome, at, closeIssue: async (url) => {
      const target = resource.parse(url, await this.site())
      if (target.kind !== 'issue')
        return
      await this.request(target.site, resource.apiRoot(target), undefined, 'PUT', { state_event: 'close' })
    } })
  }
}

export const gitlab = new GitLabChannel()
