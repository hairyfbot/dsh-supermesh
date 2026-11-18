import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { db } from '../../database'

interface TicketPatch {
  paused: boolean
  reason: string
}

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  const body = await readBody<TicketPatch>(event)
  if (!id?.trim() || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'reason' && key !== 'paused') || typeof body.paused !== 'boolean' || typeof body.reason !== 'string' || !body.reason.trim())
    throw new HTTPError({ status: 400, message: 'invalid_ticket_patch' })
  const ticket = await db.ticket.findById(id)
  if (!ticket)
    throw new HTTPError({ status: 404, message: 'not_found' })
  if (ticket.status === 'done' || ticket.status === 'cancelled')
    throw new HTTPError({ status: 409, message: 'ticket_closed' })
  const updated = await db.ticket.setPausedIfOpen(id, body.paused, new Date().toISOString())
  if (!updated)
    throw new HTTPError({ status: 409, message: 'ticket_closed' })
  return updated
})
