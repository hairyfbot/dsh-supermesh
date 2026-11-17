import { defineHandler } from 'h3'
import { db } from '../../database'
import { channel } from '../../service/channel'
import { project } from '../../service/project'
import { session } from '../../service/session'
import { setting } from '../../service/setting'

export const getPanel = defineHandler(async () => {
  const [projects, tickets, runningWorkers, supervisors, scopes, links, threads, triggers, subscriptions, channelCatalog, messages, pending, settings, savedMainSessionId, openTickets, queuedWorkers] = await Promise.all([
    project.list(),
    db.ticket.listRecent(),
    db.worker.listRunning(),
    db.supervisor.listActive(),
    db.supervisorTicket.listAll(),
    db.ticketLink.listAll(),
    db.thread.listRecent(1000),
    db.trigger.listRecent(),
    db.ticketThread.listAll(),
    channel.list(),
    db.inbox.listRecent(),
    db.inbox.listPending('user'),
    setting.load(),
    session.findMain(),
    db.ticket.listOpen(),
    db.worker.listQueued(),
  ])
  async function binding(id: string | null, role: 'main' | 'project', projectId?: string) {
    if (!id)
      return { sessionId: null, status: 'not_created' }
    const identity = await session.resolve(id)
    if (identity?.role !== role || (role === 'project' && identity.projectId !== projectId))
      return { sessionId: null, status: 'not_created' }
    const activity = await session.activity(id)
    return { sessionId: id, status: activity.running ? 'running' : activity.background ? 'background' : activity.queued ? 'queued' : 'idle' }
  }
  const [mainBinding, projectBindings] = await Promise.all([
    binding(savedMainSessionId, 'main'),
    Promise.all(projects.map(async project => ({ id: project.id, ...await binding(project.orchestratorSessionId ?? null, 'project', project.id) }))),
  ])
  const mainSessionId = mainBinding.sessionId
  const projectSessions = new Map(projectBindings.map(project => [project.id, project]))
  const activeWorkers = [...new Map([...queuedWorkers, ...runningWorkers].map(worker => [worker.id, worker])).values()]
  const runningTicketIds = new Set(runningWorkers.map(worker => worker.ticketId))
  const ticketMap = new Map(openTickets.map(ticket => [ticket.id, ticket]))
  const missingIds = [...new Set(activeWorkers.map(worker => worker.ticketId))].filter(id => !ticketMap.has(id))
  for (const ticket of await Promise.all(missingIds.map(id => db.ticket.findById(id)))) {
    if (ticket)
      ticketMap.set(ticket.id, ticket)
  }
  const currentTickets = [...ticketMap.values()].filter(ticket => !['closed', 'done', 'cancelled'].includes(ticket.status) || runningTicketIds.has(ticket.id))
  const currentTicketIds = new Set(currentTickets.map(ticket => ticket.id))
  const currentWorkers = activeWorkers.filter(worker => currentTicketIds.has(worker.ticketId) && (worker.status === 'running' || !['closed', 'done', 'cancelled'].includes(ticketMap.get(worker.ticketId)!.status)))
  const currentProjects = projects.filter(project => ['running', 'background', 'queued'].includes(projectSessions.get(project.id)!.status) || openTickets.some(ticket => ticket.projectId === project.id))
  const hasRuntime = currentTickets.length > 0 || currentProjects.length > 0 || ['running', 'background', 'queued'].includes(mainBinding.status)
  const channels = channelCatalog.filter(channel => channel.configured && channel.supported && currentTickets.some(ticket => ticket.channelId === channel.id))
  const nodes = [
    ...(channels.length ? [{ id: 'channel', kind: 'channel', label: channels.map(channel => channel.name).join(' · '), status: 'configured', projectId: null as string | null, ticketId: null as string | null, sessionId: null as string | null }] : []),
    ...(hasRuntime ? [{ id: 'orchestrator', kind: 'orchestrator', label: mainSessionId ?? '', status: mainBinding.status, projectId: null as string | null, ticketId: null as string | null, sessionId: mainSessionId }] : []),
    ...currentProjects.map(project => ({ id: `project:${project.id}`, kind: 'project', label: project.name, status: projectSessions.get(project.id)!.status, projectId: project.id, ticketId: null as string | null, sessionId: projectSessions.get(project.id)!.sessionId })),
    ...currentTickets.map(ticket => ({ id: `ticket:${ticket.id}`, kind: 'ticket', label: ticket.title, status: ticket.paused ? 'paused' : ticket.prepareError ? 'error' : ticket.status, projectId: ticket.projectId, ticketId: ticket.id, sessionId: null as string | null })),
    ...currentWorkers.map(worker => ({ id: `worker:${worker.id}`, kind: 'worker', label: worker.title, status: worker.status, projectId: ticketMap.get(worker.ticketId)!.projectId, ticketId: worker.ticketId, sessionId: worker.status === 'running' ? worker.id : null })),
  ]
  const nodeIds = new Set(nodes.map(node => node.id))
  const edges = [
    { source: 'channel', target: 'orchestrator', kind: 'flow' },
    ...currentProjects.map(project => ({ source: 'orchestrator', target: `project:${project.id}`, kind: 'flow' })),
    ...currentTickets.map(ticket => ({ source: `project:${ticket.projectId}`, target: `ticket:${ticket.id}`, kind: 'flow' })),
    ...currentWorkers.map(worker => ({ source: `ticket:${worker.ticketId}`, target: `worker:${worker.id}`, kind: 'flow' })),
    ...links.map(link => ({ source: `ticket:${link.ticketId}`, target: `ticket:${link.relatedId}`, kind: link.kind === 'depends' ? 'dependency' : 'association' })),
  ].filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  const groups = supervisors.map(supervisor => ({
    id: `supervisor:${supervisor.id}`,
    label: supervisor.title,
    sessionId: supervisor.sessionId,
    nodeIds: [...new Set(scopes.filter(scope => scope.supervisorId === supervisor.id).flatMap((scope) => {
      const ticket = currentTickets.find(ticket => ticket.id === scope.ticketId)
      return ticket && nodeIds.has(`project:${ticket.projectId}`) ? [`project:${ticket.projectId}`] : []
    }))],
  })).filter(group => group.nodeIds.length)
  const failed = messages.find(message => message.status === 'stalled' || (message.status === 'pending' && message.deliveryError))
  const activities = [mainBinding, ...projectBindings]
  const run = { state: failed ? 'delivery_failed' : runningWorkers.length || activities.some(activity => activity.status === 'running' || activity.status === 'background') ? 'running' : currentWorkers.some(worker => worker.status === 'queued') || activities.some(activity => activity.status === 'queued') ? 'queued' : 'idle', reason: failed?.deliveryError ?? null }
  return {
    projects,
    tickets,
    mainSessionId,
    graph: { nodes, edges, groups },
    run,
    inbox: {
      pending: pending.filter(message => !message.ticketId || openTickets.some(ticket => ticket.id === message.ticketId)),
      resolved: messages.filter(message => message.type === 'user' && message.status === 'done'),
      blocked: tickets.filter(ticket => ticket.paused),
    },
    topics: { threads, triggers, subscriptions },
    deliveries: messages,
    channels: channelCatalog,
    settings,
  }
})
