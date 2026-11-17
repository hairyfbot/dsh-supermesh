import type { InboxScope } from '../../database/models/inbox'
import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { db } from '../../database'
import { session } from '../../service/session'

export const getMailbox = defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id?.trim())
    throw new HTTPError({ status: 400, message: 'invalid_session' })
  const identity = await session.resolve(id)
  if (!identity)
    throw new HTTPError({ status: 404, message: 'unknown_session' })
  if (identity.role === 'worker')
    throw new HTTPError({ status: 409, message: 'worker_has_no_mailbox' })
  const scope: InboxScope = identity.role === 'project' && identity.projectId
    ? { type: 'project', projectId: identity.projectId }
    : identity.role === 'supervisor' && identity.supervisorId
      ? { type: 'supervisor', supervisorId: identity.supervisorId }
      : { type: 'main' }
  const messages = await db.inbox.listScoped(scope)
  return { sessionId: id, role: identity.role, pendingCount: messages.length, messages }
})
