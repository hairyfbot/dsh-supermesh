import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { If } from 'react-if-lite'
import { getApiNexusChannel, getApiNexusNode, getApiNexusSubscription, getApiNexusTicket, getApiNexusTrigger } from '../../../apis'
import { Empty } from '../../../components/empty'
import { TasksIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useTranslation } from '../../../hooks/use-translation'
import { Row } from '../../ticket/components/row'

export function TaskList(): ReactNode {
  const { t } = useTranslation()
  const ticket = useQuery({ queryKey: keys.ticket, queryFn: () => getApiNexusTicket() })
  const node = useQuery({ queryKey: keys.node, queryFn: () => getApiNexusNode(), refetchInterval: 15_000 })
  const channel = useQuery({ queryKey: keys.channel, queryFn: () => getApiNexusChannel() })
  const trigger = useQuery({ queryKey: keys.trigger, queryFn: () => getApiNexusTrigger(), refetchInterval: 30_000 })
  const subscription = useQuery({ queryKey: keys.subscription, queryFn: () => getApiNexusSubscription() })
  const queries = [ticket, node, channel, trigger, subscription]
  const failure = queries.find(query => query.error)?.error
  if (failure)
    return <p role="alert" className="m-0 text-xs leading-5 text-[var(--dsw-alias-state-error-primary)]">{failure instanceof Error ? failure.message : '任务列表加载失败'}</p>
  if (queries.some(query => query.isLoading))
    return <p role="status" className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-tertiary)]">加载中…</p>
  const list = ticket.data ?? []
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
