import type { ReactNode } from 'react'
import type { GraphNode } from '../../../types'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentIcon, ChannelsIcon, SupermeshIcon, TasksIcon } from '../../../components/icons'
import { useTranslation } from '../../../hooks/use-translation'

export function GraphNodeCard({ node, selected, onSelect }: { node: GraphNode, selected: boolean, onSelect: () => void }): ReactNode {
  const { t } = useTranslation()
  const Icon = node.kind === 'channel' ? ChannelsIcon : node.kind === 'task' ? TasksIcon : node.kind === 'session' ? AgentIcon : SupermeshIcon
  const statuses = { review: { label: 'overviewStatusReview', tone: 'warning' }, running: { label: 'overviewStatusRunning', tone: 'info' }, waiting: { label: 'overviewStatusWaiting', tone: 'quiet' }, queued: { label: 'graphQueued', tone: 'quiet' }, paused: { label: 'overviewStatusIntervention', tone: 'danger' }, error: { label: 'overviewStatusIntervention', tone: 'danger' }, done: { label: 'graphDone', tone: 'success' }, cancelled: { label: 'graphCancelled', tone: 'quiet' } } as const
  const status = node.kind === 'task' && node.status in statuses ? statuses[node.status as keyof typeof statuses] : undefined
  return (
    <button type="button" aria-pressed={selected} aria-label={`${t(node.label)}${node.subtitle ? ` ${node.subtitle}` : ''}${node.waiting ? ` ${t('graphWaiting')}` : ''}${status ? ` ${t(status.label)}` : ''}`} onClick={onSelect} className={`flex h-full w-full items-center gap-3 rounded-xl border bg-(--dsw-alias-bg-layer-1) px-3 text-left font-[inherit] shadow-sm outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-(--dsw-alias-state-business-primary) ${node.waiting ? 'border-dashed' : ''} ${selected ? 'border-(--dsw-alias-state-business-primary)' : 'border-(--dsw-alias-border-l2) hover:border-(--dsw-alias-border-l1)'}`}>
      <Icon width={18} height={18} className="shrink-0 text-(--dsw-alias-label-secondary)" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] leading-5 font-medium text-(--dsw-alias-label-primary)">
          <span className="truncate">{t(node.label)}</span>
          {status && <Tag tone={status.tone} className="shrink-0 px-1.5! py-0! text-[10px]! leading-4! font-normal!">{t(status.label)}</Tag>}
        </span>
        {(node.subtitle || node.waiting || node.status === 'not_created') && <span className="block truncate text-[11px] leading-5 text-(--dsw-alias-label-tertiary)">{node.waiting ? t('graphWaiting') : node.subtitle ?? t('graphNotCreated')}</span>}
      </span>
    </button>
  )
}
