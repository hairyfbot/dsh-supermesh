import type { ChannelRow, ThreadRow } from '@/channel/_shared/types'
import type { MergeRequestRemote } from '@/channel/gitlab/service/merge-request.types'
import { now, text, timestamp } from '@/channel/_shared/primitives'
import { GitLabError } from '@/channel/gitlab/runner'
import { resource } from '@/channel/gitlab/service/resource'
import { db } from '@/database'
import { defineService } from '@/utils/service'

export const mergeRequest = defineService({
  async observe(remote: MergeRequestRemote, projectId: string, thread: ThreadRow, row: ChannelRow): Promise<void> {
    const target = resource.parse(thread.url!, await remote.site())
    if (target.kind !== 'pull')
      return
    resource.validateTopic(row, target)
    const state = row.state === 'merged' ? 'merged' : row.state === 'closed' ? 'closed' : row.state === 'opened' ? 'open' : null
    if (!state)
      throw new GitLabError('invalid_response')
    const branch = typeof row.source_branch === 'string' ? text(row.source_branch) : null
    if (typeof row.title === 'string' && row.title && thread.title !== row.title)
      await db.thread.setTitle(thread.id, row.title)
    // 挂票按票上已记下的 prUrl 反查：Worker 用自造分支开 MR 时分支名对不上，
    // 绑定来自会话自己的 shell 证据。分支名只留最后兜底。
    const owned = new Set((await db.ticket.listByPullRequest(projectId, thread.url!)).map(ticket => ticket.id))
    const worker = branch ? await db.worker.findByBranch(branch) : undefined
    const fallback = worker && await db.ticket.findById(worker.ticketId)
    if (fallback?.projectId === projectId && (!fallback.prUrl || fallback.prUrl === thread.url))
      owned.add(fallback.id)
    for (const ticketId of owned) {
      const ticket = await db.ticket.findById(ticketId)
      if (!ticket)
        continue
      await db.ticketThread.link(ticketId, thread.id, now())
      await db.ticket.setPullRequest(ticketId, thread.url!, state, ticket.ciState)
    }
    for (const ticketId of await db.ticketThread.listTicketIds(thread.id)) {
      const ticket = await db.ticket.findById(ticketId)
      if (!ticket || ticket.projectId !== projectId || ticket.prUrl !== thread.url || ['done', 'cancelled'].includes(ticket.status))
        continue
      await db.ticket.setPullRequest(ticketId, thread.url, state, ticket.ciState)
    }
    if (state === 'open')
      return
    await remote.threadClosed(projectId, thread, state, timestamp(row.merged_at ?? row.closed_at ?? row.updated_at), branch)
  },
})
