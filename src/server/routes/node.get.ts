import { defineHandler } from 'h3'
import { db } from '@/database'
import { channel } from '@/service/channel'
import { project } from '@/service/project'
import { session } from '@/service/session'

export default defineHandler(async () => {
  const [projects, runningWorkers, queuedWorkers, openTickets, channelCatalog] = await Promise.all([
    project.list(),
    db.worker.listRunning(),
    db.worker.listQueued(),
    db.ticket.listOpen(),
    channel.list(),
  ])
  async function activity(id: string | null, role: 'main' | 'project', projectId?: string) {
    if (!id)
      return { sessionId: null as string | null, status: 'not_created' }
    const identity = await session.resolve(id)
    if (identity?.role !== role || (role === 'project' && identity.projectId !== projectId))
      return { sessionId: null as string | null, status: 'not_created' }
    const state = await session.activity(id)
    return { sessionId: id, status: state.running ? 'running' : state.background ? 'background' : state.queued ? 'queued' : 'idle' }
  }
  const mainBinding = await activity(await session.findMain(), 'main')
  const projectBindings = await Promise.all(projects.map(async item => ({ id: item.id, ...await activity(item.orchestratorSessionId ?? null, 'project', item.id) })))
  const projectSessions = new Map(projectBindings.map(item => [item.id, item]))
  const activeWorkers = [...new Map([...queuedWorkers, ...runningWorkers].map(worker => [worker.id, worker])).values()]
  const runningTicketIds = new Set(runningWorkers.map(worker => worker.ticketId))
  const ticketMap = new Map(openTickets.map(ticket => [ticket.id, ticket]))
  for (const ticket of await Promise.all([...new Set(activeWorkers.map(worker => worker.ticketId))].filter(id => !ticketMap.has(id)).map(id => db.ticket.findById(id)))) {
    if (ticket)
      ticketMap.set(ticket.id, ticket)
  }
  const currentTickets = [...ticketMap.values()].filter(ticket => !['closed', 'done', 'cancelled'].includes(ticket.status) || runningTicketIds.has(ticket.id))
  const currentTicketIds = new Set(currentTickets.map(ticket => ticket.id))
  const currentWorkers = activeWorkers.filter(worker => currentTicketIds.has(worker.ticketId) && (worker.status === 'running' || !['closed', 'done', 'cancelled'].includes(ticketMap.get(worker.ticketId)!.status)))
  const currentProjects = projects.filter(item => ['running', 'background', 'queued'].includes(projectSessions.get(item.id)!.status) || currentTickets.some(ticket => ticket.projectId === item.id))
  const hasRuntime = currentTickets.length > 0 || currentProjects.length > 0 || ['running', 'background', 'queued'].includes(mainBinding.status)
  const channels = channelCatalog.filter(item => item.configured && item.supported && currentTickets.some(ticket => ticket.channelId === item.id))
  return [
    ...(channels.length ? [{ id: 'channel', kind: 'channel', label: channels.map(item => item.name).join(' · '), status: 'configured', projectId: null as string | null, ticketId: null as string | null, sessionId: null as string | null }] : []),
    ...(hasRuntime ? [{ id: 'orchestrator', kind: 'orchestrator', label: mainBinding.sessionId ?? '', status: mainBinding.status, projectId: null as string | null, ticketId: null as string | null, sessionId: mainBinding.sessionId }] : []),
    ...currentProjects.map(item => ({ id: `project:${item.id}`, kind: 'project', label: item.name, status: projectSessions.get(item.id)!.status, projectId: item.id, ticketId: null as string | null, sessionId: projectSessions.get(item.id)!.sessionId })),
    ...currentTickets.map(ticket => ({ id: `ticket:${ticket.id}`, kind: 'ticket', label: ticket.title, status: ticket.paused ? 'paused' : ticket.prepareError ? 'error' : ticket.status, projectId: ticket.projectId, ticketId: ticket.id, sessionId: null as string | null })),
    ...currentWorkers.map(worker => ({ id: `worker:${worker.id}`, kind: 'worker', label: worker.title, status: worker.status, projectId: ticketMap.get(worker.ticketId)!.projectId, ticketId: worker.ticketId, sessionId: worker.status === 'running' ? worker.id : null })),
  ]
})
