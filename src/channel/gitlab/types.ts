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
