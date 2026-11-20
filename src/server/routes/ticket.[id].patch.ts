import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { db } from '@/database'
import { worker } from '@/service/worker'

interface TicketPatch {
  paused?: boolean
  status?: 'cancelled'
  reason?: string
}

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  const body = await readBody<TicketPatch>(event)
  const allowed = ['reason', 'paused', 'status']
  const validShape = body && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).every(key => allowed.includes(key))
    && (body.paused === undefined || typeof body.paused === 'boolean')
    && (body.status === undefined || body.status === 'cancelled')
    && (body.reason === undefined || (typeof body.reason === 'string' && body.reason.trim().length > 0))
    && (body.paused !== undefined || body.status !== undefined)
  if (!id?.trim() || !validShape)
    throw new HTTPError({ status: 400, message: 'invalid_ticket_patch' })
  const ticket = await db.ticket.findById(id)
  if (!ticket)
    throw new HTTPError({ status: 404, message: 'not_found' })
  if (ticket.status === 'done' || ticket.status === 'cancelled')
    throw new HTTPError({ status: 409, message: 'ticket_closed' })
  const now = new Date().toISOString()
  if (body.status === 'cancelled') {
    await worker.cancel(id)
    await db.ticket.finish(id, 'cancelled', now, now)
    return await db.ticket.findById(id)
  }
  const updated = await db.ticket.setPausedIfOpen(id, body.paused!, now)
  if (!updated)
    throw new HTTPError({ status: 409, message: 'ticket_closed' })
  return updated
})
