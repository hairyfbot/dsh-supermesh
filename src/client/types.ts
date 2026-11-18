import type { DshSupermeshKey } from './locale'

export type OverviewView = 'recent' | 'hierarchy'
export type OverviewChannelKind = 'github' | 'feishu' | 'gitlab'

export interface OverviewChannel {
  kind: OverviewChannelKind
  name: string
  connected: boolean
}

export interface OverviewTaskSegment {
  name: DshSupermeshKey
  value: number
  color: string
}

export interface AgentGraphNode {
  id: string
  kind: 'channel' | 'orchestrator' | 'route' | 'task' | 'session'
  label: string
  subtitle?: string
  x: number
  y: number
  waiting?: boolean
  group?: 'supervisor'
  taskId?: string
}

export type GraphNode = Omit<AgentGraphNode, 'label'> & { label: DshSupermeshKey, status: string, sessionId: string | null }

export interface AgentGraphEdge {
  source: string
  target: string
  kind: 'flow' | 'association' | 'dependency'
}
