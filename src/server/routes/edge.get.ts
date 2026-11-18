import { defineHandler } from 'h3'
import { db } from '../../database'

export default defineHandler(async () => {
  const [runningWorkers, queuedWorkers, links, openTickets] = await Promise.all([
    db.worker.listRunning(),
    db.worker.listQueued(),
    db.ticketLink.listAll(),
    db.ticket.listOpen(),
  ])
  const activeWorkers = [...new Map([...queuedWorkers, ...runningWorkers].map(worker => [worker.id, worker])).values()]
  const runningTicketIds = new Set(runningWorkers.map(worker => worker.ticketId))
  const ticketMap = new Map(openTickets.map(ticket => [ticket.id, ticket]))
  for (const ticket of await Promise.all([...new Set(activeWorkers.map(worker => worker.ticketId))].filter(id => !ticketMap.has(id)).map(id => db.ticket.findById(id)))) {
    if (ticket)
      ticketMap.set(ticket.id, ticket)
  }
  const currentProjects = [...new Set([...ticketMap.values()].map(ticket => ticket.projectId))]
  return [
    ...currentProjects.map(projectId => ({ source: 'orchestrator', target: `project:${projectId}`, kind: 'flow' })),
    ...[...ticketMap.values()].map(ticket => ({ source: `project:${ticket.projectId}`, target: `ticket:${ticket.id}`, kind: 'flow' })),
    ...activeWorkers.filter(worker => runningTicketIds.has(worker.ticketId) || ticketMap.has(worker.ticketId)).map(worker => ({ source: `ticket:${worker.ticketId}`, target: `worker:${worker.id}`, kind: 'flow' })),
    ...links.map(link => ({ source: `ticket:${link.ticketId}`, target: `ticket:${link.relatedId}`, kind: link.kind === 'depends' ? 'dependency' : 'association' })),
  ]
})
