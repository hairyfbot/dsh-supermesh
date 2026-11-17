import type { InboxScope } from '../../database/models/inbox'
import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { db } from '../../database'
import { session } from '../../service/session'

export const handleMail = defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  const messageId = getRouterParam(event, 'messageId', { decode: true })
  if (!id?.trim() || !messageId?.trim())
    throw new HTTPError({ status: 400, message: 'invalid_parameters' })
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
  const message = await db.inbox.findById(messageId)
  if (!message)
    throw new HTTPError({ status: 404, message: 'not_found' })
  if (!db.inbox.owns(message, scope))
    throw new HTTPError({ status: 403, message: 'scope_denied' })
  if (message.kind === 'ask' && message.status === 'pending')
    throw new HTTPError({ status: 409, message: 'answer_required' })
  const completed = await db.inbox.completeScoped([messageId], scope, new Date().toISOString())
  return { completed }
})
