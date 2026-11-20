import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getApiSupermeshChannel, getApiSupermeshNode, getApiSupermeshSubscription, getApiSupermeshTicket, getApiSupermeshTrigger } from '@/client/apis'
import { Empty } from '@/client/components/empty'
import { TasksIcon } from '@/client/components/icons'
import { Pagination } from '@/client/components/pagination'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'
import { Row } from '@/client/pages/ticket/components/row'

export const TICKET_PAGE_SIZE = 8

export function Ticket(): ReactNode {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const ticket = useQuery({
    queryKey: keys.ticketPage(page, TICKET_PAGE_SIZE),
    queryFn: () => getApiSupermeshTicket({ page: String(page), pageSize: String(TICKET_PAGE_SIZE) }),
  })
  const node = useQuery({ queryKey: keys.node, queryFn: () => getApiSupermeshNode(), refetchInterval: 15_000 })
  const channel = useQuery({ queryKey: keys.channel, queryFn: () => getApiSupermeshChannel() })
  const trigger = useQuery({ queryKey: keys.trigger, queryFn: () => getApiSupermeshTrigger(), refetchInterval: 30_000 })
  const subscription = useQuery({ queryKey: keys.subscription, queryFn: () => getApiSupermeshSubscription() })
  const queries = [ticket, node, channel, trigger, subscription]
  const failure = queries.find(query => query.error)?.error
  const tickets = ticket.data?.data ?? []
  const total = ticket.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / TICKET_PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const refreshedAt = ticket.dataUpdatedAt ? new Date(ticket.dataUpdatedAt).toISOString() : null
  return (
    <section className="@container pb-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-(--dsw-alias-label-secondary) my-1">{t('ticketListDescription')}</p>
      </div>
      {failure && <p role="alert">{failure instanceof Error ? failure.message : '任务列表加载失败'}</p>}
      {queries.some(query => query.isLoading) && <p role="status">加载中…</p>}
      {!failure && !queries.some(query => query.isLoading) && (total
        ? (
            <>
              <ul className="m-0 pl-0">
                {tickets.map(task => (
                  <Row
                    key={task.id}
                    task={task}
                    nodes={node.data ?? []}
                    channels={channel.data ?? []}
                    triggers={trigger.data ?? []}
                    subscriptions={subscription.data ?? []}
                    refreshedAt={refreshedAt}
                  />
                ))}
              </ul>
              <Pagination className="mt-4" page={current} pageCount={pageCount} onChange={setPage} />
            </>
          )
        : <Empty title={t('overviewTasksEmpty')} description={t('overviewTasksEmptyDescription')} icon={<TasksIcon width={24} height={24} />} />)}
    </section>
  )
}
