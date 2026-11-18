import type { ReactNode } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiNexusDelivery, getApiNexusProject, getApiNexusSubscription, getApiNexusThread, getApiNexusTrigger } from '../../../apis'
import { Empty } from '../../../components/empty'
import { ArrowLeftIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { groupTopics, recordsOf, sourceHref, THREAD_KINDS, TRIAGE } from '../model'
import { Event } from './components/event'

export function TriggerDetail(): ReactNode {
  const { t } = useTranslation()
  const { go, openTicket } = useActions()
  const id = useStore(state => state.trigger.selectedId)
  const project = useQuery({ queryKey: keys.project, queryFn: () => getApiNexusProject() })
  const trigger = useQuery({ queryKey: keys.trigger, queryFn: () => getApiNexusTrigger(), refetchInterval: 30_000 })
  const thread = useQuery({ queryKey: keys.thread, queryFn: () => getApiNexusThread() })
  const subscription = useQuery({ queryKey: keys.subscription, queryFn: () => getApiNexusSubscription() })
  const delivery = useQuery({ queryKey: keys.delivery, queryFn: () => getApiNexusDelivery() })
  const error = project.error ?? trigger.error ?? thread.error ?? subscription.error ?? delivery.error
  const loading = project.isLoading || trigger.isLoading || thread.isLoading || subscription.isLoading || delivery.isLoading
  const topic = groupTopics(recordsOf({ project: project.data, trigger: trigger.data, thread: thread.data, subscription: subscription.data, delivery: delivery.data })).find(topic => topic.latest.thread.id === id)
  const back = <Button size="sm" variant="ghost" icon={<ArrowLeftIcon width={16} height={16} />} onClick={() => go('trigger')}>{t('triggerBack')}</Button>
  if (error) {
    return (
      <section className="flex flex-col gap-5 pb-10">
        <div>{back}</div>
        <p role="alert" className="m-0 text-xs leading-5 text-[var(--dsw-alias-state-error-primary)]">{error.message || '话题详情加载失败，请重试。'}</p>
      </section>
    )
  }
  if (loading) {
    return (
      <section className="flex flex-col gap-5 pb-10">
        <div>{back}</div>
        <p role="status" className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">正在载入话题详情…</p>
      </section>
    )
  }
  if (!topic) {
    return (
      <section className="flex flex-col gap-5 pb-10">
        <div>{back}</div>
        <Empty compact className="rounded-xl border border-[var(--dsw-alias-border-l3)] p-5 [&>p]:text-sm [&>p]:text-[var(--dsw-alias-label-primary)]" title={t('triggerTopicNotFound')} />
      </section>
    )
  }
  const { latest, events } = topic
  const href = sourceHref(latest.channel, latest.thread.url)
  const channel = latest.channel === 'feishu' ? t('triggerFeishu') : latest.channel === 'github' ? 'GitHub' : 'GitLab'
  const tickets = [...new Set(events.flatMap(event => [...event.tickets]))]
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10" aria-label={t('triggerTopicDetail')}>
      <div>{back}</div>
      <header>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--dsw-alias-label-tertiary)]">
          <span>{channel}</span>
          {href
            ? (
                <a href={href} target="_blank" rel="noopener noreferrer" title={t('triggerSampleLink')} className="text-[var(--dsw-alias-state-business-primary)] underline-offset-4 hover:underline focus-visible:underline">
                  {latest.thread.ref}
                  {' '}
                  ↗
                </a>
              )
            : <span>{latest.thread.ref}</span>}
          <Tag tone="neutral">{t(THREAD_KINDS[latest.thread.kind])}</Tag>
          <Tag tone="outline">{t(TRIAGE[latest.thread.triage])}</Tag>
        </div>
        <h2 className="m-0 text-lg leading-7 font-medium [overflow-wrap:anywhere]">{latest.thread.title}</h2>
      </header>
      <div className="grid min-w-0 gap-5 @min-[780px]:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-medium">{t('triggerTimeline')}</h3>
            <span className="text-xs text-[var(--dsw-alias-label-tertiary)]">
              {t('triggerEventCount', { count: events.length })}
              {' '}
              ·
              {' '}
              {t('triggerNewestFirst')}
            </span>
          </div>
          <ol className="m-0 list-none p-0 pl-1.5">{events.map(event => <Event key={event.id} event={event} />)}</ol>
        </div>
        <aside className="flex min-w-0 flex-col gap-4 self-start @min-[780px]:sticky @min-[780px]:top-4">
          <section className="rounded-xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-4">
            <h3 className="m-0 text-sm font-medium">{t('triggerThread')}</h3>
            <dl className="m-0 mt-3 flex flex-col gap-3 text-xs">
              <div>
                <dt className="text-[var(--dsw-alias-label-tertiary)]">{t('ticketProject')}</dt>
                <dd className="m-0 mt-1 break-all leading-5">{latest.thread.project ?? t('triggerNoProject')}</dd>
              </div>
              <div>
                <dt className="text-[var(--dsw-alias-label-tertiary)]">{t('triggerThreadId')}</dt>
                <dd className="m-0 mt-1 break-all font-mono text-[11px] leading-5">{latest.thread.id}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-4">
            <h3 className="m-0 text-sm font-medium">{t('triggerLinkedTasks')}</h3>
            <div className="mt-3 flex flex-wrap gap-2">{tickets.length ? tickets.map(ticket => <Button key={ticket} size="sm" variant="outline" onClick={() => openTicket(ticket)}>{ticket}</Button>) : <Empty compact className="[&>p]:text-xs [&>p]:text-[var(--dsw-alias-label-tertiary)]" title={t('triggerNoTask')} />}</div>
          </section>
          <p className="m-0 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">{t('triggerExternalText')}</p>
          {href && <p className="m-0 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">{t('triggerSampleLink')}</p>}
        </aside>
      </div>
    </section>
  )
}
