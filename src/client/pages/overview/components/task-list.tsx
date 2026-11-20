import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { If } from 'react-if-lite'
import { getApiSupermeshChannel, getApiSupermeshNode, getApiSupermeshSubscription, getApiSupermeshTicket, getApiSupermeshTrigger } from '@/client/apis'
import { Empty } from '@/client/components/empty'
import { TasksIcon } from '@/client/components/icons'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'
import { Row } from '@/client/pages/ticket/components/row'

export function TaskList(): ReactNode {
  const { t } = useTranslation()
  const ticket = useQuery({ queryKey: keys.ticketPage(1, 5), queryFn: () => getApiSupermeshTicket({ page: '1', pageSize: '5' }) })
  const node = useQuery({ queryKey: keys.node, queryFn: () => getApiSupermeshNode(), refetchInterval: 15_000 })
  const channel = useQuery({ queryKey: keys.channel, queryFn: () => getApiSupermeshChannel() })
  const trigger = useQuery({ queryKey: keys.trigger, queryFn: () => getApiSupermeshTrigger(), refetchInterval: 30_000 })
  const subscription = useQuery({ queryKey: keys.subscription, queryFn: () => getApiSupermeshSubscription() })
  const queries = [ticket, node, channel, trigger, subscription]
  const failure = queries.find(query => query.error)?.error
  if (failure)
    return <p role="alert" className="m-0 text-xs leading-5 text-(--dsw-alias-state-error-primary)">{failure instanceof Error ? failure.message : '任务列表加载失败'}</p>
  if (queries.some(query => query.isLoading))
    return <p role="status" className="m-0 text-xs leading-5 text-(--dsw-alias-label-tertiary)">加载中…</p>
  const list = ticket.data?.data ?? []
  const refreshedAt = ticket.dataUpdatedAt ? new Date(ticket.dataUpdatedAt).toISOString() : null

  return (
    <If
      cond={list.length}
      else={(
        <Empty
          title={t('overviewTasksEmpty')}
          description={t('overviewTasksEmptyDescription')}
          icon={<TasksIcon width={28} height={28} />}
        />
      )}
    >
      <ul className="pl-0">
        {list.map(task => (
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
    </If>
  )
}
