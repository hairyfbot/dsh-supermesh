import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshTrigger } from '../../../apis'
import { ActivityIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useTranslation } from '../../../hooks/use-translation'
import { ActivityChart } from './activity-chart'
import { SummaryCard } from './summary-card'

export function ActivityCard({ onMore }: { onMore: () => void }): ReactNode {
  const { t } = useTranslation()
  const { data: triggers, isLoading, error } = useQuery({ queryKey: keys.trigger, queryFn: () => getApiSupermeshTrigger(), refetchInterval: 30_000 })
  const now = Date.now()
  const recent = (triggers ?? []).filter(trigger => Date.parse(trigger.at) >= now - 86400000 && Date.parse(trigger.at) <= now)
  const metrics = { received: recent.length, filtered: recent.filter(trigger => !trigger.mentioned).length, rate: recent.filter(trigger => Date.parse(trigger.at) >= now - 3600000).length }
  return (
    <SummaryCard
      title={t('overviewReceived')}
      meta={t('overviewLastDay')}
      icon={<ActivityIcon width={18} height={18} className="shrink-0" />}
      actionLabel={t('overviewMoreActivity')}
      onMore={onMore}
      background={error ? undefined : <ActivityChart triggers={triggers ?? []} />}
    >
      {error
        ? <p role="alert" className="mt-auto text-xs leading-5 text-[var(--dsw-alias-state-error-primary)]">{error instanceof Error ? error.message : '触发记录加载失败'}</p>
        : isLoading
          ? <p role="status" className="mt-auto text-xs leading-5 text-[var(--dsw-alias-label-tertiary)]">加载中…</p>
          : (
              <>
                <p aria-label={`${t('overviewReceived')} ${metrics.rate}${t('overviewPerHour')}`} className="flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-[32px] leading-10 font-semibold tracking-tight">{metrics.rate}</span>
                  <span className="text-sm text-[var(--dsw-alias-label-secondary)]">{t('overviewPerHour')}</span>
                </p>
                <dl className="mt-auto flex flex-col gap-1 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">
                  <div className="flex gap-2">
                    <dt>{t('overviewTotalMessages')}</dt>
                    <dd className="tabular-nums">{`${metrics.received} ${t('overviewItems')}`}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>{t('overviewFiltered')}</dt>
                    <dd className="tabular-nums">{`${metrics.filtered} ${t('overviewItems')}`}</dd>
                  </div>
                </dl>
              </>
            )}
    </SummaryCard>
  )
}
