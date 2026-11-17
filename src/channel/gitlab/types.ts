export interface GitLabRequest {
  site: string
  method: 'GET' | 'POST'
  path: string
  body?: Record<string, unknown>
  signal?: AbortSignal
}

export interface GitLabRunner {
  request: (request: GitLabRequest) => Promise<unknown>
}

export interface ChannelItem {
  id: string
  kind: 'issue' | 'pull' | 'comment'
  actor: string
  body: string
  url: string
  createdAt: string
  updatedAt: string
}

export interface ReadResult {
  items: ChannelItem[]
  next_offset: number | null
  next_resource: string | null
}

export interface DeliveryResult {
  ok: boolean
  reason?: string
  remoteId?: string
}
