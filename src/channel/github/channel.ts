import type { Selectable } from 'kysely'
import type { ChannelAdapter, ChannelIdentity, ChannelRow, CollectOutcome, DeliveryResult, ResourceReaded } from '@/channel/_shared/types'
import type { Resource } from '@/channel/github/service/resource.types'
import type { GhRunner } from '@/channel/github/types'
import type { DB } from '@/database/types'
import type { AnswerPort, CollectContext, CollectPort, Cursor, DeliveryPort, IngestPort } from '@/service/courier.types'
import { ChannelError } from '@/channel/_shared/error'
import { array, identity, now, number, record, text, timestamp } from '@/channel/_shared/primitives'
import { bindThreads, recordThread } from '@/channel/_shared/thread'
import { ExecFileGhRunner, GhError } from '@/channel/github/runner'
import { binding } from '@/channel/github/service/binding'
import { ci } from '@/channel/github/service/ci'
import { pull } from '@/channel/github/service/pull'
import { resource } from '@/channel/github/service/resource'
import { db } from '@/database'
import { courier } from '@/service/courier'

type Thread = Selectable<DB['thread']>

export class GitHubChannel implements ChannelAdapter {
  private readonly delivery: DeliveryPort<Resource>
  private readonly collector: CollectPort
  private readonly ingestor: IngestPort
  private readonly answerer: AnswerPort

  constructor(private readonly runner: GhRunner = new ExecFileGhRunner()) {
    const ports = binding.of(this)
    this.delivery = ports.delivery
    this.collector = ports.collector
    this.ingestor = ports.ingestor
    this.answerer = ports.answerer
  }

  async request(path: string, signal?: AbortSignal, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: Record<string, unknown>, headers?: Record<string, string>): Promise<unknown> {
    signal?.throwIfAborted()
    return this.runner.request({ site: 'github.com', path, method, body, headers, signal })
  }

  async project(projectId: string) {
    const project = await db.project.findById(projectId)
    if (!project || !resource.of(project.remoteUrl))
      throw new GhError('unknown_repository')
    if (!project.enabled)
      throw new GhError('project_disabled')
    return project
  }

  /** 仓库唯一对应一个启用项目时返回它；没有项目或不止一个都不猜。 */
  async bindingProject(repository: string): Promise<string | null> {
    const projects = (await db.project.listAll()).filter(project => project.enabled && resource.of(project.remoteUrl) === repository)
    return projects.length === 1 ? projects[0]!.id : null
  }

  async projectForRepository(repository: string) {
    const match = async (name: string) => (await db.project.listAll()).filter(project => resource.of(project.remoteUrl) === name)
    let projects = await match(repository)
    if (!projects.length) {
      // 仓库改名/转移后旧全名仍可访问：跟随一次重定向再匹配。
      // 不跟随的话，旧链接上的回复目标会永远解析不到项目，投递直接卡死。
      const canonical = await this.canonicalRepository(repository)
      if (canonical)
        projects = await match(canonical)
    }
    if (projects.length !== 1)
      throw new GhError(projects.length ? 'ambiguous_repository' : 'unknown_repository')
    return projects[0]!
  }

  private async canonicalRepository(repository: string): Promise<string | null> {
    try {
      const remote = record(await this.request(`repos/${repository}`))
      return resource.renamed(repository, text(remote.full_name))
    }
    catch {
      return null
    }
  }

  async probe(projectId: string, signal?: AbortSignal): Promise<ChannelIdentity> {
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
    const repository = resource.of(project.remoteUrl)!
    const remote = record(await this.request(`repos/${repository}`, signal))
    const canonical = resource.renamed(repository, text(remote.full_name)) ?? repository
    if (canonical !== repository) {
      // 仓库改名/转移后旧全名仍被重定向，但项目记录还停在旧名：跟随新名并落库，
      // 否则每个采集周期都在 probe 阶段失败，且作用域解析不出来，什么都不留。
      await db.project.setRemoteUrl(project.id, `https://github.com/${canonical}`, now())
      await db.sourceState.renameScope('github', repository, canonical, now())
      await courier.record('github', canonical, 'repository_renamed', { from: repository, to: canonical })
    }
    const result = { providerId, login, repositoryId: identity(remote.id), defaultBranch: typeof remote.default_branch === 'string' ? remote.default_branch : null }
    const previous = await courier.state<ChannelIdentity>('github', canonical, 'verified_environment')
    if (previous && (previous.providerId !== providerId || previous.repositoryId !== result.repositoryId))
      throw new GhError('environment_identity_changed')
    await courier.record('github', canonical, 'verified_environment', result)
    return result
  }

  async pages(path: string, signal?: AbortSignal): Promise<ChannelRow[]> {
    const result = await courier.pages(async page => ({ rows: array(await this.request(`${path + (path.includes('?') ? '&' : '?')}per_page=100&page=${page}`, signal)).map(record) }))
    return result.rows
  }

  async read(value: string, offset = 0, limit = 50, signal?: AbortSignal): Promise<ResourceReaded> {
    const target = resource.parse(value)
    const project = await this.projectForRepository(target.repository)
    await this.probe(project.id, signal)
    const root = `repos/${target.repository}`
    const main = record(await this.request(root + (target.kind === 'pull' ? '/pulls/' : '/issues/') + target.number, signal))
    resource.validate(main, target)
    const items = [resource.item(main, target.kind)]
    for (const row of await this.pages(`${root}/issues/${target.number}/comments`, signal))
      items.push(resource.item(row, 'comment'))
    if (target.kind === 'pull') {
      for (const row of await this.pages(`${root}/pulls/${target.number}/reviews`, signal))
        items.push(resource.item(row, 'review'))
      for (const row of await this.pages(`${root}/pulls/${target.number}/comments`, signal))
        items.push(resource.item(row, 'review_comment'))
    }
    items.splice(1, items.length - 1, ...items.slice(1).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)))
    return { ...courier.page(items, offset, limit), next_resource: null }
  }

  async normalize(value: string): Promise<string> {
    const target = resource.parse(value)
    return `https://github.com/${target.repository}/${target.kind === 'pull' ? 'pull' : 'issues'}/${target.number}`
  }

  async readable(value: string): Promise<boolean> {
    try {
      await this.normalize(value)
      return true
    }
    catch { return false }
  }

  async harvest(signal?: AbortSignal): Promise<CollectOutcome[]> {
    return courier.harvest(this.collector, signal)
  }

  async collect(projectId: string, branch?: string, signal?: AbortSignal): Promise<CollectOutcome> {
    return courier.collect(this.collector, projectId, branch, signal)
  }

  async collectProject(context: CollectContext, signal?: AbortSignal): Promise<void> {
    const repo = context.scope
    const { attempt, fail, baseline, environment } = context
    // 仓库唯一对应一个启用项目时，采集侧直接写话题归属：触发邮件带上项目，主编排不必按仓库名猜。
    const owner = await this.bindingProject(repo)
    if (owner)
      await bindThreads({ channel: 'github', refPrefix: `${repo}:`, projectId: owner })
    await attempt('topics', () => this.stream(repo, 'topics', `repos/${repo}/issues?state=all&sort=updated&direction=asc`, baseline, async (row) => {
      const target: Resource = { repository: repo, number: number(row.number), kind: row.pull_request ? 'pull' : 'issue' }
      resource.validate(row, target)
      const thread = await this.ensureThread(target, row, owner)
      const kind = target.kind === 'issue' && row.state === 'closed' ? 'close' : 'open'
      await courier.ingest(this.ingestor, thread, row, kind, baseline, kind)
      if (target.kind === 'pull')
        await this.collectPullRequest(context.projectId, thread.id, target.number, signal)
    }, signal))
    await attempt('comments', () => this.stream(repo, 'comments', `repos/${repo}/issues/comments?sort=updated&direction=asc`, baseline, async (row) => {
      const match = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(text(row.issue_url))
      if (!match || match[1]!.toLowerCase() !== repo)
        throw new GhError('source_repository_mismatch')
      const thread = await db.thread.findByRef('github', `${repo}:${match[2]}`)
      if (thread) {
        await courier.answers(this.answerer, thread, row)
        await courier.ingest(this.ingestor, thread, row, 'comment', baseline, 'comment')
      }
    }, signal))
    for (const thread of await db.thread.listByChannel('github')) {
      if (thread.kind !== 'pull' || !thread.url)
        continue
      const ticketIds = await db.ticketThread.listTicketIds(thread.id)
      if (!ticketIds.length)
        continue
      // 只轮询活票或近 14 天有活动的 PR：否则历史 PR 会随仓库增长线性拖慢整个采集。
      if (!(await courier.polled(ticketIds, thread.updatedAt)))
        continue
      // 已合并/已关闭且绑定票已结单的 PR，状态已成定局，不必每轮重查详情与 CI。
      const settled = await Promise.all(ticketIds.map(id => db.ticket.findById(id)))
      if (settled.every(ticket => !!ticket && ['done', 'cancelled'].includes(ticket.status) && !!ticket.prState && ['merged', 'closed'].includes(ticket.prState)))
        continue
      let target: Resource
      try {
        target = resource.parse(thread.url)
      }
      catch (error) {
        fail(error, 'pull')
        continue
      }
      if (target.repository !== repo)
        continue
      await attempt(`pull:${target.number}`, async () => {
        const root = `repos/${repo}/pulls/${target.number}`
        for (const [path, kind] of [['reviews', 'review'], ['comments', 'review_comment']] as const) {
          await attempt(`pull:${target.number}:${path}`, async () => {
            // 走增量游标而非全量翻页：每次只取上次之后的变化，避免逐个 PR 翻历史。
            await this.stream(repo, `pull:${target.number}:${path}`, `${root}/${path}?sort=updated&direction=asc`, baseline, async (row) => {
              await courier.answers(this.answerer, thread, row)
              await courier.ingest(this.ingestor, thread, row, 'comment', baseline, kind)
            }, signal)
          })
        }
        await this.collectPullRequest(context.projectId, thread.id, target.number, signal)
      })
    }
    if (environment.defaultBranch)
      await attempt('ci', () => ci.branch(this, context.projectId, environment.defaultBranch!, signal))
  }

  private async stream(repository: string, name: string, path: string, baseline: string, accept: (row: ChannelRow) => Promise<void>, signal?: AbortSignal): Promise<void> {
    await courier.stream({
      channel: 'github',
      scope: repository,
      name,
      initial: { since: baseline },
      read: async (cursor: Cursor) => {
        // 游标未动时带 If-None-Match：未变更会返回 304，不消耗 rate limit。
        const conditional: Record<string, string> | undefined = cursor.etag && cursor.etagSince === cursor.since ? { 'If-None-Match': cursor.etag } : undefined
        const value = await this.request(`${path}&since=${encodeURIComponent(cursor.since)}&per_page=100`, signal, 'GET', undefined, conditional)
        if (value && typeof value === 'object' && (value as { notModified?: boolean }).notModified)
          return { rows: [], notModified: true }
        return { rows: array(value).map(record), notModified: false }
      },
      // 游标按「读到的最新条目时间」推进，回退 5 秒重叠（官方 cursorAt 同值）。
      // 空结果不动游标 —— 按 startedAt 推进会跳过采集窗口内新建的条目，正是漏采的原因。
      advance: (cursor, rows) => {
        const newest = Math.max(...rows.map(row => Date.parse(timestamp(row.updated_at))).filter(Number.isFinite))
        const moved = Number.isFinite(newest) ? new Date(newest - 5_000).toISOString() : cursor.since
        return { since: moved > cursor.since ? moved : cursor.since }
      },
      accept,
      signal,
    })
  }

  private async ensureThread(target: Resource, row: ChannelRow, projectId: string | null): Promise<Thread> {
    return recordThread({ channel: 'github', refId: `${target.repository}:${target.number}`, kind: target.kind, title: text(row.title), url: text(row.html_url), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), projectId })
  }

  async collectPullRequest(projectId: string, threadId: string, number: number, signal?: AbortSignal): Promise<void> {
    try {
      const result = await pull.collect(this, projectId, threadId, signal)
      if (!result.ok)
        throw new GhError(result.reason!, undefined, result.location ?? `pull:${number}`)
    }
    catch (error) {
      // 抛出的错误也要带上 PR 号，否则 topics 流只会留下一个无效响应码。
      if (error instanceof ChannelError && !error.location)
        error.location = `pull:${number}`
      throw error
    }
  }

  async publish(inboxId: string, signal?: AbortSignal): Promise<DeliveryResult> {
    return courier.publish(this.delivery, inboxId, signal)
  }

  async flush(signal?: AbortSignal): Promise<({ id: string } & DeliveryResult)[]> {
    return courier.flush(this.delivery, signal)
  }
}

export const github = new GitHubChannel()
