import type { ChannelAuthentication } from '@/service/devops.types'
import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { devops } from '@/service/devops'

export default defineHandler((event): ChannelAuthentication => {
  const id = getRouterParam(event, 'id')
  const authenticationId = getRouterParam(event, 'authenticationId')
  if (!id || !authenticationId)
    throw new HTTPError({ status: 400, message: 'invalid_authentication' })
  const authentication = devops.lookup(id, authenticationId)
  if (!authentication)
    throw new HTTPError({ status: 404, message: 'channel_auth_not_found' })
  return authentication
})
