import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshTicket } from '../../../apis'
import { TasksIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useTranslation } from '../../../hooks/use-translation'
import { SummaryCard } from './summary-card'
import { TaskChart } from './task-chart'

const SEGMENTS = [
  { name: 'overviewInProgress', color: 'var(--dsw-alias-state-business-primary)' },
  { name: 'overviewCompleted', color: 'var(--dsw-alias-state-success-primary)' },
  { name: 'overviewBlocked', color: 'var(--dsw-alias-state-error-primary)' },
] as const

export function TaskCard({ onMore }: { onMore: () => void }): ReactNode {
  const { t } = useTranslation()
  const { data: tickets, isLoading, error } = useQuery({ queryKey: keys.ticketPage(1, 100), queryFn: () => getApiSupermeshTicket({ page: '1', pageSize: '100' }) })
  const list = tickets?.data ?? []
  const now = Date.now()
  const added = list.filter(ticket => Date.parse(ticket.createdAt) >= now - 86400000).length
  const segments = SEGMENTS.map(segment => ({
    ...segment,
    value: list.filter((ticket) => {
      const closed = ticket.status === 'done' || ticket.status === 'cancelled'
      if (segment.name === 'overviewCompleted')
        return ticket.status === 'done'
      if (segment.name === 'overviewBlocked')
        return !closed && Boolean(ticket.paused || ticket.prepareError)
      return !closed && !ticket.paused && !ticket.prepareError && ['running', 'queued', 'review'].includes(ticket.status)
    }).length,
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
                    <span className="text-[32px] leading-10 font-semibold tracking-tight">{added}</span>
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
