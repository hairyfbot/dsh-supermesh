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
    await remote.threadClosed(projectId, thread, state, timestamp(row.merged_at ?? row.closed_at ?? row.updated_at), branch)
  },
})
