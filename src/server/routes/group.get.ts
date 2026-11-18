import { defineHandler } from 'h3'
import { db } from '../../database'

export default defineHandler(async () => {
  const [supervisors, scopes, runningWorkers, queuedWorkers, openTickets] = await Promise.all([
    db.supervisor.listActive(),
    db.supervisorTicket.listAll(),
    db.worker.listRunning(),
    db.worker.listQueued(),
    db.ticket.listOpen(),
  ])
  const activeWorkers = [...new Map([...queuedWorkers, ...runningWorkers].map(worker => [worker.id, worker])).values()]
  const runningTicketIds = new Set(runningWorkers.map(worker => worker.ticketId))
  const ticketMap = new Map(openTickets.map(ticket => [ticket.id, ticket]))
  for (const ticket of await Promise.all([...new Set(activeWorkers.map(worker => worker.ticketId))].filter(id => !ticketMap.has(id)).map(id => db.ticket.findById(id)))) {
    if (ticket)
      ticketMap.set(ticket.id, ticket)
  }
  const current = [...ticketMap.values()].filter(ticket => !['closed', 'done', 'cancelled'].includes(ticket.status) || runningTicketIds.has(ticket.id))
  return supervisors.map(supervisor => ({
    id: `supervisor:${supervisor.id}`,
    label: supervisor.title,
    sessionId: supervisor.sessionId,
    nodeIds: [...new Set(scopes.filter(scope => scope.supervisorId === supervisor.id).flatMap((scope) => {
      const ticket = current.find(item => item.id === scope.ticketId)
      return ticket ? [`project:${ticket.projectId}`] : []
    }))],
  })).filter(group => group.nodeIds.length)
})
