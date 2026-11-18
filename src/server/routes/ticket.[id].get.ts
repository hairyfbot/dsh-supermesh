import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { db } from '../../database'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id?.trim())
    throw new HTTPError({ status: 400, message: 'invalid_ticket' })
  const ticket = await db.ticket.findById(id)
  if (!ticket)
    throw new HTTPError({ status: 404, message: 'not_found' })
  const [project, executions, outgoing, incoming, subscriptions, inbox] = await Promise.all([
    db.project.findById(ticket.projectId),
    db.worker.listByTicket(id),
    db.ticketLink.listByTicket(id),
    db.ticketLink.listByRelated(id),
    db.ticketThread.listByTicket(id),
    db.inbox.listByTicket(id),
  ])
  const topics = (await Promise.all(subscriptions.map(link => db.thread.findById(link.threadId)))).filter(topic => topic !== undefined)
  const triggers = (await Promise.all(topics.map(topic => db.trigger.listByThread(topic.id)))).flat()
  const dependencies = [...outgoing, ...incoming.filter(link => !outgoing.some(other => other.ticketId === link.ticketId && other.relatedId === link.relatedId && other.kind === link.kind))]
  return { ticket, project: project ?? null, executions, dependencies, subscriptions, topics, triggers, inbox }
})
