import type { ProjectRow } from '@/channel/_shared/types'

export interface CiRemote {
  site: () => Promise<string>
  request: (site: string, path: string, signal?: AbortSignal) => Promise<unknown>
  project: (projectId: string) => Promise<ProjectRow>
}
