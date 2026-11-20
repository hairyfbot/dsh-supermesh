import type { ChannelView } from '@/service/channel.types'
import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { devops } from '@/service/devops'

export default defineHandler(async (event): Promise<{ channel: ChannelView }> => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw new HTTPError({ status: 400, message: 'channel_unsupported' })
  try {
    await devops.cancel(id)
    return { channel: await devops.removeCredentials(id) }
  }
  catch (error) {
    const unsupported = error instanceof TypeError && error.message === 'channel_unsupported'
    throw new HTTPError({ status: unsupported ? 400 : 502, message: unsupported ? 'channel_unsupported' : 'channel_credentials_delete_failed' })
  }
})
