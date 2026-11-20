import type { ThreadRow } from '@/channel/_shared/types'

export interface MergeRequestRemote {
  site: () => Promise<string>
  threadClosed: (projectId: string, thread: ThreadRow, outcome: 'merged' | 'closed', at: string, branch: string | null) => Promise<void>
}
