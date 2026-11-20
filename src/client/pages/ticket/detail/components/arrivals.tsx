import type { ReactNode } from 'react'
import type { GetApiSupermeshTicketidResponse } from '@/client/apis/index.type'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { Empty } from '@/client/components/empty'
import { useTranslation } from '@/client/hooks/use-translation'

export function Arrivals({ triggers, inbox }: { triggers: GetApiSupermeshTicketidResponse['triggers'], inbox: GetApiSupermeshTicketidResponse['inbox'] }): ReactNode {
  const { t } = useTranslation()
  const arrivals = [
    ...triggers.map(trigger => ({ id: `trigger-${trigger.id}`, message: trigger.text, at: trigger.at, answer: null })),
    ...inbox.filter(message => !message.triggerId || !triggers.some(trigger => trigger.id === message.triggerId)).map(message => ({ id: `inbox-${message.id}`, message: message.message, at: message.createdAt, answer: message.answer })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const row = (arrival: (typeof arrivals)[number]): ReactNode => (
    <li key={arrival.id} className="flex min-w-0 items-start gap-2 text-[13px] leading-5">
      <StateDot state="idle" size={6} className="mt-[7px] shrink-0" />
      <span className="min-w-0 flex-1 whitespace-pre-wrap text-(--dsw-alias-label-secondary) [overflow-wrap:anywhere]">
        {arrival.message}
        {arrival.answer && <span className="block">{arrival.answer}</span>}
      </span>
      <time dateTime={arrival.at} className="shrink-0 whitespace-nowrap text-xs text-(--dsw-alias-label-tertiary) tabular-nums">{t('ticketArrivedAgo', { count: Math.max(0, Math.floor((Date.now() - new Date(arrival.at).getTime()) / 3600000)) })}</time>
    </li>
  )
  if (!arrivals.length)
    return <Empty inline title={t('ticketArrivalsEmpty')} />
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{arrivals.slice(0, 2).map(row)}</ul>
      {arrivals.length > 2 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md py-1 text-xs text-(--dsw-alias-label-secondary) hover:text-(--dsw-alias-label-primary) focus-visible:outline-2 focus-visible:outline-(--dsw-alias-state-business-primary) [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="h-px flex-1 bg-(--dsw-alias-border-l3)" />
            <span className="group-open:hidden">{t('ticketExpandArrivals')}</span>
            <span className="hidden group-open:inline">{t('ticketCollapseArrivals')}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-(--dsw-alias-border-l3)" />
          </summary>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">{arrivals.slice(2).map(row)}</ul>
        </details>
      )}
    </div>
  )
}
