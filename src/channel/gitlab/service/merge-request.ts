import type { ChannelRow, ThreadRow } from '@/channel/_shared/types'
import type { MergeRequestRemote } from '@/channel/gitlab/service/merge-request.types'
import { now, timestamp } from '@/channel/_shared/primitives'
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
    if (typeof row.title === 'string' && row.title && thread.title !== row.title)
      await db.thread.setTitle(thread.id, row.title)
    // 挂票只认票上已记下的 prUrl：绑定来自 Worker 会话自己的 shell 证据。
    // 分支名是模型的自由发挥，不参与匹配，也不做兜底。
    for (const ticket of await db.ticket.listByPullRequest(projectId, thread.url!)) {
      await db.ticketThread.link(ticket.id, thread.id, now())
      await db.ticket.setPullRequest(ticket.id, thread.url!, state, ticket.ciState)
    }
    for (const ticketId of await db.ticketThread.listTicketIds(thread.id)) {
      const ticket = await db.ticket.findById(ticketId)
      if (!ticket || ticket.projectId !== projectId || ticket.prUrl !== thread.url || ['done', 'completed', 'cancelled'].includes(ticket.status))
        continue
      await db.ticket.setPullRequest(ticketId, thread.url, state, ticket.ciState)
    }
    if (state === 'open')
      return
    await remote.threadClosed(projectId, thread, state, timestamp(row.merged_at ?? row.closed_at ?? row.updated_at))
  },
})
