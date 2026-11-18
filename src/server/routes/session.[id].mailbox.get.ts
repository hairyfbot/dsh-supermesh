import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { inbox } from '../../service/inbox'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id?.trim())
    throw new HTTPError({ status: 400, message: 'invalid_session' })
  return { mailbox: await inbox.peek(id) }
})
