import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-forge-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'
import { getServerContext } from 'dsh-h3/utils'
import { now } from '@/channel/_shared/primitives'
import { resource as githubResource } from '@/channel/github/service/resource'
import { gitlab } from '@/channel/gitlab/channel'
import { resource as gitlabResource } from '@/channel/gitlab/service/resource'
import { db } from '@/database'
import { server } from '@/server'
import { shellEvidence } from '@/service/forge.evidence'
import { session } from '@/service/session'
import { defineService } from '@/utils/service'

type Ticket = Selectable<DB['ticket']>
type Project = Selectable<DB['project']>

/** 已经补挂过的票：同一个运行时里不重复读会话日志。 */
const reconciled = new Set<string>()
/** 确认过不是 Worker 的会话：主编排、项目编排的每条工具结果都查一次库没有意义。 */
const outsiders = new Set<string>()

export const forge = defineService({
  /**
   * Worker 会话里出现开单证据时把变更请求挂到票上。
   * 分支名是模型的自由发挥，不能当唯一依据；这里读的是会话自己的 shell 结果。
   */
  async observe(source: Session, event: SessionEvent): Promise<void> {
    if (event.type !== 'tool/result' && event.type !== 'turn/end')
      return
    if (outsiders.has(source.id))
      return
    try {
      // Worker 会话 id 就是 worker 行 id，按主键认人即可；每次工具结果都读整份会话日志太重。
      const worker = await db.worker.findById(source.id)
      if (!worker) {
        outsiders.add(source.id)
        return
      }
      const ticket = await db.ticket.findById(worker.ticketId)
      if (!ticket || ticket.prUrl || ticket.status === 'done' || ticket.status === 'cancelled')
        return
      const project = await db.project.findById(ticket.projectId)
      if (!project?.enabled)
        return
      reconciled.add(ticket.id)
      // 回合结束才回读日志：工具结果阶段只读已经折好的绑定，别把整份日志翻一遍。
      await attach(ticket, await evidenceOf(source, project, ticket, event.type === 'turn/end'))
    }
    catch (error) {
      getServerContext<Context>(server).logger.warn('supermesh: forge binding failed for %s: %s', source.id, error instanceof Error ? error.message : String(error))
    }
  },
  /** 补挂历史票：Worker 早就开过 PR，但当时没挂上。每个运行时每张票只补一次。 */
  async reconcile(): Promise<void> {
    for (const ticket of await db.ticket.listOpen()) {
      if (ticket.prUrl || reconciled.has(ticket.id))
        continue
      if (ticket.status !== 'waiting' && ticket.status !== 'review')
        continue
      reconciled.add(ticket.id)
      const worker = (await db.worker.listByTicket(ticket.id)).at(-1)
      const project = await db.project.findById(ticket.projectId)
      if (!worker || !project?.enabled)
        continue
      const source = await session.instance(worker.id)
      if (!source)
        continue
      try {
        await attach(ticket, await evidenceOf(source, project, ticket, true))
      }
      catch (error) {
        getServerContext<Context>(server).logger.warn('supermesh: forge backfill failed for %s: %s', ticket.id, error instanceof Error ? error.message : String(error))
      }
    }
  },
})

async function evidenceOf(source: Session, project: Project, ticket: Ticket, settled: boolean): Promise<string[]> {
  if (ticket.channelId === 'github')
    return githubEvidence(source, project)
  if (ticket.channelId === 'gitlab' && settled)
    return gitlabEvidence(source, project)
  return []
}

/**
 * GitHub 走官方 forge-session：绑定来自会话自己的 `gh pr create`、`gh pr view` 等
 * 命令结果，以及推送后按分支反查到的打开状态 PR。
 */
async function githubEvidence(source: Session, project: Project): Promise<string[]> {
  const service = getServerContext<Context>(server).forgeSession
  const repository = project.remoteUrl ? githubResource.of(project.remoteUrl) : null
  if (!service || !repository)
    return []
  // 推送发现由官方按 git push 结果自己做；这里只读它折出来的绑定，不拿分支名去猜。
  return service.changeRequests(source)
    .map(entry => entry.url)
    .filter(url => githubRepositoryOf(url) === repository)
}

function githubRepositoryOf(url: string): string | null {
  try {
    return githubResource.parse(url).repository
  }
  catch {
    return null
  }
}

/**
 * GitLab 没有官方 provider，按同一套证据自己做：`glab mr create` 打印的地址，
 * 以及 `git push` 之后按源分支反查到的打开状态 MR。
 */
async function gitlabEvidence(source: Session, project: Project): Promise<string[]> {
  const site = await gitlab.site()
  const scope = await gitlab.scopeOf(project).catch(() => null)
  if (!scope)
    return []
  const { events } = await session.history(source.id)
  const evidence = shellEvidence(events)
  const urls = evidence.urls.filter(url => gitlabScopeOf(url, site) === scope)
  // 只按 git push 自己报告的分支反查，不用 Worker 建树时的分支名。
  const branches = new Set(evidence.branches.map(entry => entry.branch))
  for (const name of branches) {
    for (const url of await openMergeRequests(site, scope, name)) {
      if (!urls.includes(url))
        urls.push(url)
    }
  }
  return urls
}

function gitlabScopeOf(url: string, site: string): string | null {
  try {
    return gitlabResource.source(gitlabResource.parse(url, site))
  }
  catch {
    return null
  }
}

async function openMergeRequests(site: string, scope: string, branch: string): Promise<string[]> {
  const repository = scope.slice(site.length + 1)
  if (!repository)
    return []
  const { rows } = await gitlab.pages(site, `projects/${encodeURIComponent(repository)}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`)
  const urls: string[] = []
  for (const row of rows) {
    if (row.state !== 'opened' || row.source_branch !== branch || typeof row.web_url !== 'string')
      continue
    if (gitlabScopeOf(row.web_url, site) === scope)
      urls.push(row.web_url)
  }
  return urls
}

/** 挂票并订阅 PR 话题：采集只轮询有票订阅的 PR，不建这条链接就永远等不到状态与结单。 */
async function attach(ticket: Ticket, urls: readonly string[]): Promise<void> {
  for (const url of urls) {
    const current = await db.ticket.findById(ticket.id)
    if (!current || current.prUrl)
      return
    const threadId = await ensureThread(current, url)
    if (!threadId)
      continue
    await db.ticketThread.link(current.id, threadId, now())
    // 只写 prUrl：状态与 CI 归采集侧，别把并发读到的结果覆盖成空。
    await db.ticket.save(current.id, { prUrl: url })
  }
}

async function ensureThread(ticket: Ticket, url: string): Promise<string | null> {
  if (ticket.channelId === 'github') {
    const target = githubResource.parse(url)
    const refId = `${target.repository}:${target.number}`
    const existing = await db.thread.findByRef('github', refId)
    if (existing)
      return existing.id
    const at = now()
    return (await db.thread.record({
      id: `github:${refId}`,
      channelId: 'github',
      refId,
      kind: 'pull',
      title: `PR #${target.number}`,
      url: `https://github.com/${target.repository}/pull/${target.number}`,
      createdAt: at,
      updatedAt: at,
      projectId: ticket.projectId,
      triage: 'claimed',
      triagedAt: at,
    })).id
  }
  if (ticket.channelId === 'gitlab') {
    const target = gitlabResource.parse(url, await gitlab.site())
    const refId = `${gitlabResource.source(target)}:${target.kind}:${target.number}`
    const existing = await db.thread.findByRef('gitlab', refId)
    if (existing)
      return existing.id
    const at = now()
    return (await db.thread.record({
      id: `gitlab:${refId}`,
      channelId: 'gitlab',
      refId,
      kind: 'pull',
      title: `MR !${target.number}`,
      url: gitlabResource.url(target),
      createdAt: at,
      updatedAt: at,
      projectId: ticket.projectId,
      triage: 'claimed',
      triagedAt: at,
    })).id
  }
  return null
}
