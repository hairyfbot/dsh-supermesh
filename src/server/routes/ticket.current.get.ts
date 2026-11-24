import { defineHandler } from 'h3'
import { db } from '@/database'

export default defineHandler(async () => {
  const [runningWorkers, queuedWorkers, openTickets] = await Promise.all([
    db.worker.listRunning(),
    db.worker.listQueued(),
    db.ticket.listOpen(),
  ])
  const runningTicketIds = new Set(runningWorkers.map(worker => worker.ticketId))
  const activeWorkers = [...new Map([...queuedWorkers, ...runningWorkers].map(worker => [worker.id, worker])).values()]
  const ticketMap = new Map(openTickets.map(ticket => [ticket.id, ticket]))
  for (const ticket of await Promise.all([...new Set(activeWorkers.map(worker => worker.ticketId))].filter(id => !ticketMap.has(id)).map(id => db.ticket.findById(id)))) {
    if (ticket)
      ticketMap.set(ticket.id, ticket)
  }
  return [...ticketMap.values()].filter(ticket => !['closed', 'done', 'completed', 'cancelled'].includes(ticket.status) || runningTicketIds.has(ticket.id))
})
