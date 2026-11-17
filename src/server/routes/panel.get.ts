import { defineHandler } from 'h3'
import { db } from '../../database'
import { setting } from '../../service/setting'

export const getPanel = defineHandler(async () => {
  const [projects, tickets, workers, supervisors, scopes, links, threads, triggers, subscriptions, channels, accounts, messages, pending, settings] = await Promise.all([
    db.project.listAll(),
    db.ticket.listRecent(),
    db.worker.listRecent(),
    db.supervisor.listActive(),
    db.supervisorTicket.listAll(),
    db.ticketLink.listAll(),
    db.thread.listRecent(1000),
    db.trigger.listRecent(),
    db.ticketThread.listAll(),
    db.channel.listAll(),
    db.channelAccount.listAll(),
    db.inbox.listRecent(),
    db.inbox.listPending('user'),
    setting.load(),
  ])
  const nodes = [
    ...projects.map(project => ({ id: `project:${project.id}`, kind: 'project', label: project.name, status: project.enabled ? 'enabled' : 'disabled', projectId: project.id, ticketId: null as string | null, sessionId: project.orchestratorSessionId })),
    ...tickets.map(ticket => ({ id: `ticket:${ticket.id}`, kind: 'ticket', label: ticket.title, status: ticket.paused ? 'paused' : ticket.prepareError ? 'error' : ticket.status, projectId: ticket.projectId, ticketId: ticket.id, sessionId: null as string | null })),
    ...workers.map(worker => ({ id: `worker:${worker.id}`, kind: 'worker', label: worker.id, status: worker.status, projectId: tickets.find(ticket => ticket.id === worker.ticketId)?.projectId ?? null, ticketId: worker.ticketId, sessionId: worker.id })),
    ...supervisors.map(supervisor => ({ id: `supervisor:${supervisor.id}`, kind: 'supervisor', label: supervisor.title, status: supervisor.status, projectId: null as string | null, ticketId: null as string | null, sessionId: supervisor.sessionId })),
  ]
  const edges = [
    ...tickets.map(ticket => ({ source: `project:${ticket.projectId}`, target: `ticket:${ticket.id}`, kind: 'flow' })),
    ...workers.map(worker => ({ source: `ticket:${worker.ticketId}`, target: `worker:${worker.id}`, kind: 'flow' })),
    ...scopes.map(scope => ({ source: `supervisor:${scope.supervisorId}`, target: `ticket:${scope.ticketId}`, kind: 'association' })),
    ...links.map(link => ({ source: `ticket:${link.ticketId}`, target: `ticket:${link.relatedId}`, kind: link.kind === 'depends' ? 'dependency' : 'association' })),
  ].filter(edge => nodes.some(node => node.id === edge.source) && nodes.some(node => node.id === edge.target))
  const failed = messages.find(message => message.status === 'stalled' || (message.status === 'pending' && message.deliveryError))
  const run = { state: failed ? 'delivery_failed' : workers.some(worker => worker.status === 'running') ? 'running' : 'idle', reason: failed?.deliveryError ?? null }
  return {
    projects,
    tickets,
    graph: { nodes, edges },
    run,
    inbox: {
      pending,
      resolved: messages.filter(message => message.type === 'user' && message.status === 'done'),
      blocked: tickets.filter(ticket => ticket.paused),
    },
    topics: { threads, triggers, subscriptions },
    deliveries: messages,
    channels: channels.map(channel => ({ ...channel, enabled: Boolean(channel.enabled), accounts: accounts.filter(account => account.channelId === channel.id) })),
    settings,
  }
})
