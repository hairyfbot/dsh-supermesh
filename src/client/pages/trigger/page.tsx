import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getApiSupermeshTopic } from '@/client/apis'
import { Empty } from '@/client/components/empty'
import { ActivityIcon } from '@/client/components/icons'
import { Pagination } from '@/client/components/pagination'
import { keys } from '@/client/config/query-keys'
import { useActions, useStore } from '@/client/hooks/use-store'
import { useTranslation } from '@/client/hooks/use-translation'
import { Filters } from '@/client/pages/trigger/components/filters'
import { Row } from '@/client/pages/trigger/components/row'
import { Summary } from '@/client/pages/trigger/components/summary'
import { KINDS } from '@/client/pages/trigger/model'

export const TRIGGER_PAGE_SIZE = 5

export function Trigger(): ReactNode {
  const { t } = useTranslation()
  const filters = useStore(state => state.trigger.filters)
  const { resetTriggerFilters } = useActions()
  const [page, setPage] = useState(1)
  const query = {
    query: filters.query || undefined,
    channel: filters.channel === 'all' ? undefined : filters.channel,
    status: filters.status === 'all' ? undefined : filters.status,
    kind: filters.kind === 'all' ? undefined : KINDS[filters.kind],
    mentionedOnly: filters.mentionedOnly ? 'true' : undefined,
  }
  const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined))
  const topic = useQuery({
    queryKey: keys.topicPage(page, TRIGGER_PAGE_SIZE, query),
    queryFn: () => getApiSupermeshTopic({ ...params, page: String(page), pageSize: String(TRIGGER_PAGE_SIZE) }),
    refetchInterval: 30_000,
  })
  const records = topic.data?.data ?? []
  const total = topic.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / TRIGGER_PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const error = topic.error
  const loading = topic.isLoading
  let content: ReactNode
  if (error) {
    content = <p role="alert" className="m-0 px-4 py-6 text-xs text-(--dsw-alias-state-error-primary)">{error.message || '触发记录加载失败，请重试。'}</p>
  }
  else if (loading) {
    content = <p role="status" className="m-0 px-4 py-6 text-xs leading-5 text-(--dsw-alias-label-secondary)">正在载入触发记录…</p>
  }
  else if (total) {
    content = <ul className="m-0 list-none p-0">{records.map(item => <Row key={item.latest.thread.id} topic={item} />)}</ul>
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
      <Summary filters={params} />
      <div className="flex flex-col gap-3">
        <Filters />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--dsw-alias-label-tertiary)">
          <span role="status">{t('triggerResultCount', { count: records.length, total })}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1)">
          {content}
        </div>
        {!error && !loading && total > 0 && <Pagination page={current} pageCount={pageCount} onChange={setPage} />}
        <p className="m-0 text-[11px] leading-5 text-(--dsw-alias-label-tertiary)">{t('triggerPreviewNotice')}</p>
      </div>
    </section>
  )
}
