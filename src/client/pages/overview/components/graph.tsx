import type { ReactNode } from 'react'
import type { AgentGraphEdge } from '../../../types'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshEdge, getApiSupermeshGroup, getApiSupermeshNode } from '../../../apis'
import { Empty } from '../../../components/empty'
import { AgentIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useTranslation } from '../../../hooks/use-translation'
import { GraphCanvas } from './graph-canvas'
import { layoutGraph } from './graph-layout'

export function Graph(): ReactNode {
  const { t } = useTranslation()
  const { data: nodes, isLoading, error } = useQuery({ queryKey: keys.node, queryFn: () => getApiSupermeshNode(), refetchInterval: 15_000 })
  const { data: edges } = useQuery({ queryKey: keys.edge, queryFn: () => getApiSupermeshEdge(), refetchInterval: 15_000 })
  const { data: groups } = useQuery({ queryKey: keys.group, queryFn: () => getApiSupermeshGroup(), refetchInterval: 15_000 })
  const laid = nodes ? layoutGraph({ nodes, edges: edges ?? [], groups: groups ?? [] }) : []
  const list: AgentGraphEdge[] = (edges ?? []).map(edge => ({ ...edge, kind: edge.kind === 'dependency' ? 'dependency' : edge.kind === 'association' ? 'association' : 'flow' }))
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1)">
      <header className="border-b border-(--dsw-alias-border-l3) px-5 py-2">
        <h2 className="mb-0 mt-1 text-[13px] font-medium">{t('graphTitle')}</h2>
        <p className="mb-0 mt-1 text-xs leading-5 text-(--dsw-alias-label-tertiary)">{t('graphDescription')}</p>
      </header>
      {error
        ? <Empty className="min-h-95" title={t('graphUnavailable')} description={error instanceof Error ? error.message : t('graphUnavailableDescription')} icon={<AgentIcon width={28} height={28} />} />
        : laid.length
          ? <GraphCanvas nodes={laid} edges={list} groups={groups ?? []} />
          : <Empty className="min-h-95" title={t(isLoading ? 'graphLoading' : 'graphEmpty')} description={isLoading ? undefined : t('graphEmptyDescription')} icon={<AgentIcon width={28} height={28} />} />}
    </section>
  )
}
