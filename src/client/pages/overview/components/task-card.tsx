import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshTicketCount } from '@/client/apis'
import { TasksIcon } from '@/client/components/icons'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'
import { SummaryCard } from '@/client/pages/overview/components/summary-card'
import { TaskChart } from '@/client/pages/overview/components/task-chart'

const SEGMENTS = [
  { name: 'overviewInProgress', color: 'var(--dsw-alias-state-business-primary)' },
  { name: 'overviewCompleted', color: 'var(--dsw-alias-state-success-primary)' },
  { name: 'overviewBlocked', color: 'var(--dsw-alias-state-error-primary)' },
] as const

export function TaskCard({ onMore }: { onMore: () => void }): ReactNode {
  const { t } = useTranslation()
  const { data: counts, isLoading, error } = useQuery({ queryKey: keys.ticketCount, queryFn: () => getApiSupermeshTicketCount(), refetchInterval: 30_000 })
  const segments = SEGMENTS.map(segment => ({
    ...segment,
    value: ({
      overviewInProgress: counts?.inProgress,
      overviewCompleted: counts?.completed,
      overviewBlocked: counts?.blocked,
    } as Record<string, number | undefined>)[segment.name] ?? 0,
  }))
  return (
    <SummaryCard title={t('overviewTaskSummary')} icon={<TasksIcon width={18} height={18} className="shrink-0" />} actionLabel={t('overviewMoreTasks')} onMore={onMore}>
      {error
        ? <p role="alert" className="mt-auto text-xs leading-5 text-(--dsw-alias-state-error-primary)">{error instanceof Error ? error.message : '任务列表加载失败'}</p>
        : isLoading
          ? <p role="status" className="mt-auto text-xs leading-5 text-(--dsw-alias-label-tertiary)">加载中…</p>
          : (
              <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
                <div className="flex h-full min-w-0 flex-col">
                  <p className="flex items-baseline gap-1.5 tabular-nums">
                    <span className="text-[32px] leading-10 font-semibold tracking-tight">{counts?.added ?? 0}</span>
                    <span className="text-xs text-(--dsw-alias-label-secondary)">{t('overviewAdded')}</span>
                  </p>
                  <dl className="mt-auto grid grid-cols-[auto_max-content] gap-x-5 gap-y-1 text-xs leading-5 text-(--dsw-alias-label-secondary)">
                    {segments.map(segment => (
                      <div key={segment.name} className="col-span-2 grid grid-cols-subgrid items-center whitespace-nowrap">
                        <dt className="flex items-center gap-2">
                          <span className="size-1.5 shrink-0 rounded-full" style={{ background: segment.color }} />
                          {t(segment.name)}
                        </dt>
                        <dd className="m-0 text-right tabular-nums">{segment.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <TaskChart segments={segments} />
              </div>
            )}
    </SummaryCard>
  )
}
