import type { Selectable } from 'kysely'
import type { CiSnapshot, PullFact, RemotePort } from '@/channel/github/service/ci.types'
import type { DB } from '@/database/types'
import { digest, now, record, text, timestamp } from '@/channel/_shared/primitives'
import { closeThread } from '@/channel/_shared/thread'
import { GhError } from '@/channel/github/runner'
import { ci } from '@/channel/github/service/ci'
import { resource } from '@/channel/github/service/resource'
import { db } from '@/database'
import { singlet } from '@/runtime/singlet'
import { courier } from '@/service/courier'
import { defineService } from '@/utils/service'

type Thread = Selectable<DB['thread']>

export const pull = defineService({
  async collect(remote: RemotePort, projectId: string, threadId: string, signal?: AbortSignal): Promise<{ ok: boolean, reason?: string }> {
    return singlet.immediate(`github:exclusive:pull:${threadId}`, async () => {
      const project = await remote.project(projectId)
      await remote.probe(projectId, signal)
      const thread = await db.thread.findById(threadId)
      if (!thread?.url || thread.kind !== 'pull')
        throw new GhError('invalid_pull_request')
      const target = resource.parse(thread.url)
      if (target.repository !== resource.of(project.remoteUrl))
        throw new GhError('source_repository_mismatch')
      const root = `repos/${target.repository}`
      const detail = record(await remote.request(`${root}/pulls/${target.number}`, signal))
      resource.validate(detail, target)
      const head = text(record(detail.head).sha)
      const base = record(detail.base)
      if (text(record(base.repo).full_name).toLowerCase() !== target.repository)
        throw new GhError('pull_request_mismatch')
      const state = detail.merged === true ? 'merged' : detail.state === 'open' ? 'open' : detail.state === 'closed' ? 'closed' : null
      if (!state)
        throw new GhError('invalid_response')
      const previous = await courier.state<PullFact>('github', target.repository, `pr_fact:${target.number}`)
      const updatedAt = timestamp(detail.updated_at)
      if (previous && (previous.updatedAt > updatedAt || (previous.state === 'merged' && state !== 'merged')))
        return { ok: false, reason: 'stale_pr_snapshot' }
      let ciState: CiSnapshot['state'] = previous?.head === head ? previous.ciState : 'pending'
      let ciError: string | undefined
      let snapshot: CiSnapshot | undefined
      try {
        snapshot = await ci.snapshot(remote, root, head, signal)
        ciState = snapshot.state
      }
      catch (error) {
        if (signal?.aborted)
          throw error
        ciError = courier.failure(error, false)
      }
      const fact: PullFact = { head, base: text(base.ref), state, ciState, collectedAt: now(), updatedAt, ciError, url: text(detail.html_url) }
      await courier.record('github', target.repository, `pr_fact:${target.number}`, fact)
      const branch = typeof record(detail.head).ref === 'string' ? text(record(detail.head).ref) : null
      if (typeof detail.title === 'string' && detail.title && thread.title !== detail.title)
        await db.thread.setTitle(thread.id, detail.title)
      // 挂票按票上已记下的 prUrl 反查：Worker 用自造分支开 PR 时分支名对不上，
      // 绑定来自会话自己的 shell 证据。分支名只留最后兜底。
      const owned = new Set((await db.ticket.listByPullRequest(projectId, thread.url)).map(ticket => ticket.id))
      const worker = branch ? await db.worker.findByBranch(branch) : undefined
      const fallback = worker && await db.ticket.findById(worker.ticketId)
      if (fallback?.projectId === projectId && (!fallback.prUrl || fallback.prUrl === thread.url))
        owned.add(fallback.id)
      for (const ticketId of owned) {
        await db.ticketThread.link(ticketId, thread.id, now())
        await db.ticket.setPullRequest(ticketId, thread.url, state, ciState)
      }
      const subscriptions = await db.ticketThread.listTicketIds(thread.id)
      for (const ticketId of subscriptions) {
        const ticket = await db.ticket.findById(ticketId)
        if (ticket?.projectId === projectId && ticket.prUrl === thread.url)
          await db.ticket.setPullRequest(ticketId, thread.url, state, ciState)
      }
      if (state === 'merged' || state === 'closed')
        await pull.closed(remote, projectId, thread, state, detail.merged === true ? timestamp(detail.merged_at ?? detail.closed_at ?? detail.updated_at) : timestamp(detail.closed_at ?? detail.updated_at), branch)
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
  },
  async closed(remote: RemotePort, projectId: string, thread: Thread, outcome: 'merged' | 'closed', at: string, branch: string | null): Promise<void> {
    await closeThread({ channel: 'github', projectId, thread, outcome, at, branch, closeIssue: async (url) => {
      const target = resource.parse(url)
      if (target.kind !== 'issue')
        return
      await remote.request(`repos/${target.repository}/issues/${target.number}`, undefined, 'PATCH', { state: 'closed' })
    } })
  },
})
