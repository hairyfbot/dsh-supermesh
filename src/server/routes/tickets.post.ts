import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { db } from '../../database'

interface TicketCommand {
  reason: string
}

export const postTicket = defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  const action = getRouterParam(event, 'action')
  if (action !== 'pause' && action !== 'resume')
    throw new HTTPError({ status: 404, message: 'unknown_command' })
  const body = await readBody<TicketCommand>(event)
  if (!id?.trim() || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'reason') || typeof body.reason !== 'string' || !body.reason.trim())
    throw new HTTPError({ status: 400, message: 'reason_required' })
  const ticket = await db.ticket.findById(id)
  if (!ticket)
    throw new HTTPError({ status: 404, message: 'not_found' })
  if (ticket.status === 'done' || ticket.status === 'cancelled')
    throw new HTTPError({ status: 409, message: 'ticket_closed' })
  const updated = await db.ticket.setPausedIfOpen(id, action === 'pause', new Date().toISOString())
  if (!updated)
    throw new HTTPError({ status: 409, message: 'ticket_closed' })
  return updated
})
