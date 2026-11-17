export interface GhRequest {
  site: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT'
  path: string
  body?: Record<string, unknown>
  signal?: AbortSignal
}

export interface GhRunner {
  request: (request: GhRequest) => Promise<unknown>
}

export interface ChannelItem {
  id: string
  kind: 'issue' | 'pull' | 'comment' | 'review' | 'review_comment'
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
