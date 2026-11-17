import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { inbox } from '../../service/inbox'

export const patchMail = defineHandler(async (event) => {
  const body = await readBody<{ status: 'done' }>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'status') || body.status !== 'done')
    throw new HTTPError({ status: 400, message: 'invalid_mail_patch' })
  const id = getRouterParam(event, 'id', { decode: true })
  const messageId = getRouterParam(event, 'messageId', { decode: true })
  if (!id?.trim() || !messageId?.trim())
    throw new HTTPError({ status: 400, message: 'invalid_parameters' })
  const mailbox = await inbox.peek(id)
  if (!mailbox)
    throw new HTTPError({ status: 404, message: 'unknown_session' })
  const message = mailbox.messages.find(message => message.id === messageId)
  if (!message)
    throw new HTTPError({ status: 403, message: 'scope_denied' })
  if (message.kind === 'ask')
    throw new HTTPError({ status: 409, message: 'answer_required' })
  return { completed: await inbox.complete(id, [messageId]) }
})
