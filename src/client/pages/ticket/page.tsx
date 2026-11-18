import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiNexusChannel, getApiNexusNode, getApiNexusSubscription, getApiNexusTicket, getApiNexusTrigger } from '../../apis'
import { Empty } from '../../components/empty'
import { TasksIcon } from '../../components/icons'
import { keys } from '../../config/query-keys'
import { useTranslation } from '../../hooks/use-translation'
import { Row } from './components/row'

export function Ticket(): ReactNode {
  const { t } = useTranslation()
  const ticket = useQuery({ queryKey: keys.ticket, queryFn: () => getApiNexusTicket() })
  const node = useQuery({ queryKey: keys.node, queryFn: () => getApiNexusNode(), refetchInterval: 15_000 })
  const channel = useQuery({ queryKey: keys.channel, queryFn: () => getApiNexusChannel() })
  const trigger = useQuery({ queryKey: keys.trigger, queryFn: () => getApiNexusTrigger(), refetchInterval: 30_000 })
  const subscription = useQuery({ queryKey: keys.subscription, queryFn: () => getApiNexusSubscription() })
  const queries = [ticket, node, channel, trigger, subscription]
  const failure = queries.find(query => query.error)?.error
  const tickets = ticket.data ?? []
  const refreshedAt = ticket.dataUpdatedAt ? new Date(ticket.dataUpdatedAt).toISOString() : null
  return (
    <section className="@container pb-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--dsw-alias-label-secondary)] my-1">{t('ticketListDescription')}</p>
      </div>
      {failure && <p role="alert">{failure instanceof Error ? failure.message : '任务列表加载失败'}</p>}
      {queries.some(query => query.isLoading) && <p role="status">加载中…</p>}
      {!failure && !queries.some(query => query.isLoading) && (tickets.length
        ? (
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
          )
        : <Empty title={t('overviewTasksEmpty')} description={t('overviewTasksEmptyDescription')} icon={<TasksIcon width={24} height={24} />} />)}
    </section>
  )
}
