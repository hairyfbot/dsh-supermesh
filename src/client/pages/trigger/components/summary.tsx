import type { ReactNode } from 'react'
import type * as Types from '@/client/apis/index.type'
import type { DeliveryStatus } from '@/client/pages/trigger/model'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshTopicCount } from '@/client/apis'
import { useActions, useStore } from '@/client/hooks/use-store'
import { useTranslation } from '@/client/hooks/use-translation'
import { STATUSES } from '@/client/pages/trigger/model'

export interface TriggerFiltersForCount {
  query?: string
  channel?: string
  kind?: string
  mentionedOnly?: string
}

export function Summary({ filters }: { filters: TriggerFiltersForCount }): ReactNode {
  const { t } = useTranslation()
  const { setTriggerFilters } = useActions()
  const selected = useStore(state => state.trigger.filters.status)
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''))
  const counts = useQuery({
    queryKey: ['supermesh', 'topic', 'count', params],
    queryFn: () => getApiSupermeshTopicCount(params),
    refetchInterval: 30_000,
  })
  const data = counts.data as Types.GetApiSupermeshTopicCountResponse | undefined
  const cards: { value: 'all' | DeliveryStatus, label: string, count: number, color: string }[] = [
    { value: 'all', label: t('triggerReceived'), count: data?.all ?? 0, color: 'var(--dsw-alias-label-primary)' },
    ...(['pending', 'done', 'stalled'] as const).map(value => ({ value, label: t(STATUSES[value].label), count: data?.[value] ?? 0, color: `var(--dsw-alias-state-${value === 'stalled' ? 'error' : value === 'done' ? 'success' : 'business'}-primary)` })),
  ]
  return (
    <div className="grid grid-cols-2 gap-3 @min-[740px]:grid-cols-4" role="group" aria-label={t('triggerSummary')}>
      {cards.map(card => (
        <button key={card.value} type="button" aria-pressed={selected === card.value} onClick={() => setTriggerFilters({ status: card.value })} className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-2xl border bg-(--dsw-alias-bg-layer-1) px-4 py-3.5 text-left outline-none transition-colors hover:bg-(--dsw-alias-card-fill) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dsw-alias-state-business-primary) ${selected === card.value ? 'border-(--dsw-alias-state-business-primary)' : 'border-(--dsw-alias-border-l3)'}`}>
          <span className="flex items-center gap-2 text-xs leading-5 text-(--dsw-alias-label-secondary)">
            <span className="size-1.5 rounded-full" style={{ background: card.color }} />
            {card.label}
          </span>
          <span className="text-[26px] leading-8 font-semibold tracking-tight tabular-nums">
            {card.count}
            <span className="ml-2 text-xs font-normal text-(--dsw-alias-label-tertiary)">{t('triggerTopicsUnit')}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
