export type ChannelKind = 'github' | 'gitlab' | 'feishu'

export interface ChannelConnection {
  readonly host: string | null
  readonly token: string | undefined
  readonly enabled: boolean
}

export interface ChannelConfiguration {
  host?: string
  enabled?: boolean
  commitName?: string
  commitEmail?: string
  token?: string
}

export interface ChannelDrop {
  reason: string
  actor: string
  at: string
}

export interface ChannelView {
  id: string
  kind: ChannelKind
  name: string
  host: string | null
  enabled: boolean
  createdAt: string
  configured: boolean
  supported: boolean
  hasCredential: boolean
  status: 'unsupported' | 'unconfigured' | 'disabled' | 'offline' | 'online'
  commitName: string
  commitEmail: string
  commitEmailSuggestion: string
  providerId: string
  lastDrop: ChannelDrop | null
  accounts: { id: string, channelId: string, role: 'bot' | 'admin', name: string, avatar: string | null, status: 'online' | 'offline', createdAt: string }[]
}
