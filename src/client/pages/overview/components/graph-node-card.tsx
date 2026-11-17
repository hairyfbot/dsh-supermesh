import type { ReactNode } from 'react'
import type { AgentGraphNode } from '../../../types'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { AgentIcon, ChannelsIcon, NexusIcon, TasksIcon } from '../../../components/icons'
import { useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function GraphNodeCard({ node, selected, onSelect }: { node: AgentGraphNode, selected: boolean, onSelect: () => void }): ReactNode {
  const { t } = useTranslation()
  const Icon = node.kind === 'channel' ? ChannelsIcon : node.kind === 'task' ? TasksIcon : node.kind === 'session' ? AgentIcon : NexusIcon
  const task = useStore(state => state.data.panel?.tickets.find(task => task.id === node.taskId))
  const status = task?.paused ? '已暂停' : task?.status
  return (
    <button type="button" aria-pressed={selected} aria-label={`${node.label}${node.subtitle ? ` ${node.subtitle}` : ''}${node.waiting ? ` ${t('graphWaiting')}` : ''}${status ? ` ${status}` : ''}`} onClick={onSelect} className={`flex h-full w-full items-center gap-3 rounded-xl border bg-[var(--dsw-alias-bg-layer-1)] px-3 text-left font-[inherit] shadow-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--dsw-alias-state-business-primary)] ${node.waiting ? 'border-dashed' : ''} ${selected ? 'border-[var(--dsw-alias-state-business-primary)]' : 'border-[var(--dsw-alias-border-l2)] hover:border-[var(--dsw-alias-border-l1)]'}`}>
      <Icon width={18} height={18} className="shrink-0 text-[var(--dsw-alias-label-secondary)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] leading-5 font-medium text-[var(--dsw-alias-label-primary)]">
          <span className="truncate">{node.label}</span>
          {status && <Tag tone="quiet" className="shrink-0 px-1.5! py-0! text-[10px]! leading-4! font-normal!">{status}</Tag>}
        </span>
        {(node.subtitle || node.waiting) && <span className="block truncate text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">{node.waiting ? t('graphWaiting') : node.subtitle}</span>}
      </span>
    </button>
  )
}
