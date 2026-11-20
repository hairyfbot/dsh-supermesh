import type { ChannelIdentity, ProjectRow } from '@/channel/_shared/types'

export interface CiSnapshot {
  state: 'pending' | 'running' | 'passing' | 'failing'
  checks: Record<string, unknown>[]
  statuses: Record<string, unknown>[]
}

export interface PullFact {
  head: string
  base: string
  state: 'open' | 'closed' | 'merged'
  ciState: CiSnapshot['state']
  collectedAt: string
  updatedAt: string
  ciError?: string
  url: string
}

export interface RemotePort {
  request: (path: string, signal?: AbortSignal, method?: 'GET' | 'POST' | 'PATCH', body?: Record<string, unknown>, headers?: Record<string, string>) => Promise<unknown>
  project: (projectId: string) => Promise<ProjectRow>
  probe: (projectId: string, signal?: AbortSignal) => Promise<ChannelIdentity>
}
