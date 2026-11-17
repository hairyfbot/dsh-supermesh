import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { Empty } from '../../components/empty'
import { ActivityIcon } from '../../components/icons'
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
  const panel = useStore(state => state.data.panel)
  const topics = groupTopics(recordsOf(panel))
  const records = filterTopics(topics, filters)
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10" aria-label={t('tabTriggers')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base leading-6 font-medium">{t('triggerTitle')}</h2>
          <p className="m-0 mt-1 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('triggerDescription')}</p>
        </div>
      </header>
      <Summary />
      <div className="flex flex-col gap-3">
        <Filters />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--dsw-alias-label-tertiary)]">
          <span role="status">{t('triggerResultCount', { count: records.length, total: topics.length })}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]">
          {records.length
            ? <ul className="m-0 list-none p-0">{records.map(topic => <Row key={topic.latest.thread.id} topic={topic} />)}</ul>
            : (
                <Empty className="!min-h-0 !gap-3 !py-6" title={t('triggerEmpty')} description={t('triggerEmptyDescription')} icon={<ActivityIcon width={24} height={24} />}>
                  <Button size="sm" variant="outline" onClick={resetTriggerFilters}>{t('triggerReset')}</Button>
                </Empty>
              )}
        </div>
        <p className="m-0 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">{t('triggerPreviewNotice')}</p>
      </div>
    </section>
  )
}
