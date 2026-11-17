import type { } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { GetApiNexusPanelResponse } from '../../../apis/index.type'
import type { AgentGraphNode, GraphNode } from '../../../types'
import { AGENT_GRAPH } from '../../../config/constants'

export type GraphGroup = GetApiNexusPanelResponse['graph']['groups'][number]

export function layoutGraph(graph: GetApiNexusPanelResponse['graph']): GraphNode[] {
  const positions = new Map<string, { x: number, y: number }>()
  let row = 0
  const membership = (id: string) => graph.groups.filter(group => group.nodeIds.includes(id)).map(group => group.id).sort().join('|')
  const projects = graph.nodes.filter(node => node.kind === 'project').sort((a, b) => membership(a.id).localeCompare(membership(b.id)))
  for (const project of projects) {
    const start = row
    for (const ticket of graph.nodes.filter(node => node.kind === 'ticket' && node.projectId === project.projectId)) {
      const workers = graph.nodes.filter(node => node.kind === 'worker' && node.ticketId === ticket.ticketId)
      positions.set(ticket.id, { x: 620, y: 36 + row * 124 })
      for (const [index, worker] of workers.entries())
        positions.set(worker.id, { x: 896, y: 36 + (row + index) * 124 })
      row += Math.max(1, workers.length)
    }
    row = Math.max(row, start + 1)
    positions.set(project.id, { x: 300, y: 36 + start * 124 + Math.min(row - start - 1, 2) * 62 })
  }
  for (const node of graph.nodes) {
    if (positions.has(node.id) || node.kind === 'channel' || node.kind === 'orchestrator')
      continue
    positions.set(node.id, { x: node.kind === 'worker' ? 896 : 620, y: 36 + row++ * 124 })
  }
  const rootY = 244
  positions.set('channel', { x: 36, y: Math.max(58, rootY - 186) })
  positions.set('orchestrator', { x: 36, y: rootY })
  return graph.nodes.map(node => ({
    id: node.id,
    kind: node.kind === 'project' ? 'route' : node.kind === 'ticket' ? 'task' : node.kind === 'worker' ? 'session' : node.kind === 'channel' ? 'channel' : 'orchestrator',
    label: node.kind === 'project' ? 'graphRoute' : node.kind === 'ticket' ? 'graphTask' : node.kind === 'worker' ? 'graphSession' : node.kind === 'channel' ? 'graphChannel' : 'graphOrchestrator',
    subtitle: node.kind === 'ticket' ? node.ticketId ?? node.label ?? undefined : node.kind === 'orchestrator' ? undefined : node.label ?? undefined,
    taskId: node.ticketId ?? undefined,
    sessionId: node.sessionId,
    status: node.status,
    waiting: node.kind === 'worker' && node.status === 'queued',
    ...positions.get(node.id)!,
  }))
}

export function graphViewport(nodes: readonly AgentGraphNode[], view: { zoom: number, x: number, y: number }, fit = false) {
  const bounds = fit ? graphBounds(nodes) : AGENT_GRAPH
  const width = bounds.width / view.zoom
  const height = bounds.height / view.zoom
  return { left: (bounds.width - width) / 2 + view.x, top: (bounds.height - height) / 2 + view.y, width, height }
}

export function graphBounds(nodes: readonly AgentGraphNode[]) {
  return { width: AGENT_GRAPH.width, height: Math.max(AGENT_GRAPH.height, ...nodes.map(node => node.y + AGENT_GRAPH.nodeHeight + 46)) }
}
