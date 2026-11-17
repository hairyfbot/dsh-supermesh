import type { ChannelAuthentication } from '../../service/channel-auth.types'
import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { channelAuth } from '../../service/channel-auth'

export const getChannelAuthentication = defineHandler((event): ChannelAuthentication => {
  const id = getRouterParam(event, 'id')
  const authenticationId = getRouterParam(event, 'authenticationId')
  if (!id || !authenticationId)
    throw new HTTPError({ status: 400, message: 'invalid_authentication' })
  const authentication = channelAuth.lookup(id, authenticationId)
  if (!authentication)
    throw new HTTPError({ status: 404, message: 'channel_auth_not_found' })
  return authentication
})
