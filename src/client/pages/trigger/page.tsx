import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshDelivery, getApiSupermeshProject, getApiSupermeshSubscription, getApiSupermeshThread, getApiSupermeshTrigger } from '../../apis'
import { Empty } from '../../components/empty'
import { ActivityIcon } from '../../components/icons'
import { keys } from '../../config/query-keys'
import { useActions, useStore } from '../../hooks/use-store'
import { useTranslation } from '../../hooks/use-translation'
import { Filters } from './components/filters'
import { Row } from './components/row'
import { Summary } from './components/summary'
import { filterTopics, groupTopics, recordsOf } from './model'

export function Trigger(): ReactNode {
  const { t } = useTranslation()
  const filters = useStore(state => state.trigger.filters)
  const { resetTriggerFilters } = useActions()
  const project = useQuery({ queryKey: keys.project, queryFn: () => getApiSupermeshProject() })
  const trigger = useQuery({ queryKey: keys.trigger, queryFn: () => getApiSupermeshTrigger(), refetchInterval: 30_000 })
  const thread = useQuery({ queryKey: keys.thread, queryFn: () => getApiSupermeshThread() })
  const subscription = useQuery({ queryKey: keys.subscription, queryFn: () => getApiSupermeshSubscription() })
  const delivery = useQuery({ queryKey: keys.delivery, queryFn: () => getApiSupermeshDelivery() })
  const topics = groupTopics(recordsOf({ project: project.data, trigger: trigger.data, thread: thread.data, subscription: subscription.data, delivery: delivery.data }))
  const records = filterTopics(topics, filters)
  const error = project.error ?? trigger.error ?? thread.error ?? subscription.error ?? delivery.error
  const loading = project.isLoading || trigger.isLoading || thread.isLoading || subscription.isLoading || delivery.isLoading
  let content: ReactNode
  if (error) {
    content = <p role="alert" className="m-0 px-4 py-6 text-xs text-(--dsw-alias-state-error-primary)">{error.message || '触发记录加载失败，请重试。'}</p>
  }
  else if (loading) {
    content = <p role="status" className="m-0 px-4 py-6 text-xs leading-5 text-(--dsw-alias-label-secondary)">正在载入触发记录…</p>
  }
  else if (records.length) {
    content = <ul className="m-0 list-none p-0">{records.map(topic => <Row key={topic.latest.thread.id} topic={topic} />)}</ul>
  }
  else {
    content = (
      <Empty className="!min-h-0 !gap-3 !py-6" title={t('triggerEmpty')} description={t('triggerEmptyDescription')} icon={<ActivityIcon width={24} height={24} />}>
        <Button size="sm" variant="outline" onClick={resetTriggerFilters}>{t('triggerReset')}</Button>
      </Empty>
    )
  }
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10" aria-label={t('tabTriggers')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base leading-6 font-medium">{t('triggerTitle')}</h2>
          <p className="m-0 mt-1 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('triggerDescription')}</p>
        </div>
      </header>
      <Summary topics={topics} />
      <div className="flex flex-col gap-3">
        <Filters />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--dsw-alias-label-tertiary)">
          <span role="status">{t('triggerResultCount', { count: records.length, total: topics.length })}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1)">
          {content}
        </div>
        <p className="m-0 text-[11px] leading-5 text-(--dsw-alias-label-tertiary)">{t('triggerPreviewNotice')}</p>
      </div>
    </section>
  )
}
