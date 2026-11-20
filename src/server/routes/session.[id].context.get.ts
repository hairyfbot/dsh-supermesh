import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { inbox } from '@/service/inbox'
import { session } from '@/service/session'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id?.trim())
    throw new HTTPError({ status: 400, message: 'invalid_session' })
  const identity = await session.resolve(id)
  if (!identity)
    throw new HTTPError({ status: 404, message: 'unknown_session' })
  const context = await session.view(id, 0, 12000)
  return { sessionId: id, role: identity.role, pendingCount: (await inbox.peek(id))!.pendingCount, ...context }
})
