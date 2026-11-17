import type { ChannelAuthentication, ChannelAuthenticationRequest } from '../../service/channel-auth.types'
import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { channelAuth } from '../../service/channel-auth'

export const postChannelAuthentication = defineHandler(async (event): Promise<ChannelAuthentication> => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw new HTTPError({ status: 400, message: 'invalid_channel' })
  const body = await readBody<ChannelAuthenticationRequest>(event)
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'host') || (body.host !== undefined && typeof body.host !== 'string')))
    throw new HTTPError({ status: 400, message: 'invalid_authentication' })
  try {
    return await channelAuth.start(id, body?.host)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'channel_unsupported' || message === 'invalid_channel_host')
      throw new HTTPError({ status: 400, message })
    if (message === 'channel_auth_in_progress')
      throw new HTTPError({ status: 409, message })
    throw new HTTPError({ status: 503, message: 'channel_auth_unavailable' })
  }
})
