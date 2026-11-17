import type { ReactNode } from 'react'
import type { AgentGraphEdge, AgentGraphNode } from '../../../types'
import { useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { GraphCanvas } from './graph-canvas'

export function Graph(): ReactNode {
  const { t } = useTranslation()
  const graph = useStore(state => state.data.panel?.graph)
  const rows = new Map<string, number>()
  const nodes: AgentGraphNode[] = (graph?.nodes ?? []).map((node) => {
    const row = rows.get(node.kind) ?? 0
    rows.set(node.kind, row + 1)
    const column = node.kind === 'project' ? 0 : node.kind === 'ticket' ? 1 : node.kind === 'worker' ? 2 : 3
    return { id: node.id, kind: node.kind === 'ticket' ? 'task' : node.kind === 'worker' ? 'session' : 'route', label: node.label, subtitle: node.status, taskId: node.ticketId ?? undefined, x: 36 + column * 260, y: 30 + row * 100 }
  })
  const edges: AgentGraphEdge[] = (graph?.edges ?? []).map(edge => ({ ...edge, kind: edge.kind === 'dependency' ? 'dependency' : edge.kind === 'association' ? 'association' : 'flow' }))
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]">
      <header className="border-b border-[var(--dsw-alias-border-l3)] px-5 py-2">
        <h2 className="text-[13px] font-medium mb-0 mt-1">{t('graphTitle')}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--dsw-alias-label-tertiary)] mb-0">{t('graphDescription')}</p>
      </header>
      <GraphCanvas nodes={nodes} edges={edges} />
    </section>
  )
}
