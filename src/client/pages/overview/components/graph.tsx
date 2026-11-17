import type { } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ReactNode } from 'react'
import type { AgentGraphEdge } from '../../../types'
import { Empty } from '../../../components/empty'
import { AgentIcon } from '../../../components/icons'
import { useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { GraphCanvas } from './graph-canvas'
import { layoutGraph } from './graph-layout'

export function Graph(): ReactNode {
  const { t } = useTranslation()
  const { panel, loading, error } = useStore(state => state.data)
  const graph = panel?.graph
  const nodes = graph ? layoutGraph(graph) : []
  const edges: AgentGraphEdge[] = (graph?.edges ?? []).map(edge => ({ ...edge, kind: edge.kind === 'dependency' ? 'dependency' : edge.kind === 'association' ? 'association' : 'flow' }))
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]">
      <header className="border-b border-[var(--dsw-alias-border-l3)] px-5 py-2">
        <h2 className="text-[13px] font-medium mb-0 mt-1">{t('graphTitle')}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--dsw-alias-label-tertiary)] mb-0">{t('graphDescription')}</p>
      </header>
      {nodes.length ? <GraphCanvas nodes={nodes} edges={edges} groups={graph?.groups ?? []} /> : <Empty className="min-h-[380px]" title={t(loading ? 'graphLoading' : error ? 'graphUnavailable' : 'graphEmpty')} description={loading ? undefined : t(error ? 'graphUnavailableDescription' : 'graphEmptyDescription')} icon={<AgentIcon width={28} height={28} />} />}
    </section>
  )
}
