import type { ChannelConfiguration, ChannelView } from '../../service/channel.types'
import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { channel } from '../../service/channel'

export default defineHandler(async (event): Promise<{ channel: ChannelView }> => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<ChannelConfiguration>(event)
  if (!id || !body)
    throw new HTTPError({ status: 400, message: 'invalid_channel_config' })
  try {
    return { channel: await channel.save(id, body) }
  }
  catch (error) {
    const allowed = ['channel_unsupported', 'invalid_channel_config', 'invalid_channel_token', 'invalid_commit_identity', 'invalid_channel_host', 'invalid_expected_account', 'channel_identity_mismatch', 'channel_account_required', 'channel_auth_failed', 'channel_verification_failed']
    const message = error instanceof Error && allowed.includes(error.message) ? error.message : 'channel_save_failed'
    throw new HTTPError({ status: error instanceof TypeError ? 400 : message === 'channel_auth_failed' ? 422 : 502, message })
  }
})
