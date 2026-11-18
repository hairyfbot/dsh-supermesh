export interface GitLabRequest {
  site: string
  method: 'GET' | 'POST' | 'PUT'
  path: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
  /** 传 true 时返回 { body, etag } 而不是裸 body，用于条件请求。 */
  withEtag?: boolean
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
