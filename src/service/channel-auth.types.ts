export interface ChannelAuthenticationRequest {
  host?: string
}

export interface ChannelAuthentication {
  id: string
  channelId: string
  status: 'pending' | 'succeeded' | 'failed'
  output: string
  verificationUri?: string
  userCode?: string
  error?: string
  account?: { login: string }
}
