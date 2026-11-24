import { defineHandler } from 'h3'
import { db } from '@/database'

/** 任务卡片的统计：全量计数，不受分页与列表取数上限影响。 */
export default defineHandler(async (): Promise<{ all: number, added: number, inProgress: number, completed: number, blocked: number }> => {
  const rows = await db.ticket.listAll()
  const since = Date.now() - 86_400_000
  let added = 0
  let inProgress = 0
  let completed = 0
  let blocked = 0
  for (const ticket of rows) {
    if (Date.parse(ticket.createdAt) >= since)
      added++
    const closed = ['done', 'completed', 'cancelled'].includes(ticket.status)
    if (ticket.status === 'done' || ticket.status === 'completed')
      completed++
    else if (!closed && (ticket.paused || ticket.prepareError))
      blocked++
    else if (!closed && !ticket.paused && !ticket.prepareError && ['running', 'queued', 'review'].includes(ticket.status))
      inProgress++
  }
  return { all: rows.length, added, inProgress, completed, blocked }
})
