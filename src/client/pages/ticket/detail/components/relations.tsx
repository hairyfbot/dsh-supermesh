import type { ReactNode } from 'react'
import type { GetApiSupermeshTicketidResponse } from '@/client/apis/index.type'
import { Button, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshTicket } from '@/client/apis'
import { Empty } from '@/client/components/empty'
import { keys } from '@/client/config/query-keys'
import { useActions } from '@/client/hooks/use-store'
import { useTranslation } from '@/client/hooks/use-translation'

export function Relations({ links, ticketId, empty, clear }: { clear?: boolean, links: GetApiSupermeshTicketidResponse['dependencies'], ticketId: string, empty: string }): ReactNode {
  const { openTicket } = useActions()
  const { t } = useTranslation()
  const { data: tickets, error } = useQuery({ queryKey: keys.ticketPage(1, 100), queryFn: () => getApiSupermeshTicket({ page: '1', pageSize: '100' }) })
  const statusLabels = { waiting: 'overviewStatusWaiting', queued: 'ticketStatusQueued', running: 'overviewStatusRunning', review: 'overviewStatusReview', done: 'overviewCompleted', cancelled: 'ticketStatusCancelled' } as const
  if (error)
    return <p role="alert" className="m-0 text-xs leading-5 text-(--dsw-alias-state-error-primary)">{error instanceof Error ? error.message : '任务列表加载失败'}</p>
  return links.length
    ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {links.map((link) => {
            const id = link.ticketId === ticketId ? link.relatedId : link.ticketId
            const task = tickets?.data.find(task => task.id === id)
            return (
              <li key={link.ticketId + link.relatedId + link.kind} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Button variant="ghost" size="sm" className="max-w-full !h-auto !justify-start !whitespace-normal text-left" onClick={() => openTicket(id)}>
                  <span className="text-xs text-(--dsw-alias-label-secondary)">{id}</span>
                  {task && <span className="[overflow-wrap:anywhere]">{task.title}</span>}
                </Button>
                {task && <Tag tone={task.prepareError ? 'danger' : task.status === 'done' ? 'success' : task.status === 'review' ? 'warning' : task.status === 'running' ? 'info' : 'quiet'}>{task.paused && task.status !== 'done' && task.status !== 'cancelled' ? t('ticketStatusPaused') : t(statusLabels[task.status])}</Tag>}
              </li>
            )
          })}
        </ul>
      )
    : <Empty inline title={empty} icon={<StateDot state={clear ? 'done' : 'idle'} size={7} />} />
}
