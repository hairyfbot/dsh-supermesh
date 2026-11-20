export interface GhRequest {
  site: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT'
  path: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface GhRunner {
  request: (request: GhRequest) => Promise<unknown>
}
