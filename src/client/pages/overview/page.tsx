import type { SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import type { } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ReactNode } from 'react'
import type { OverviewTaskSegment, OverviewView } from '../../types'
import { Button, Input, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsyncFn } from '@reause/core'
import { useId } from 'react'
import { getApiNexusPanel, postApiNexusAsksIdAnswers } from '../../apis'
import { Empty } from '../../components/empty'
import { ActivityIcon, ChannelsIcon, TasksIcon } from '../../components/icons'
import { useActions, useStore } from '../../hooks/use-store'
import { useTranslation } from '../../hooks/use-translation'
import { Row } from '../ticket/components/row'
import { ActivityChart } from './components/activity-chart'
import { ChannelTile } from './components/channel-tile'
import { Graph } from './components/graph'
import { SummaryCard } from './components/summary-card'
import { TaskChart } from './components/task-chart'

const OVERVIEW_TASK_SEGMENTS: OverviewTaskSegment[] = [
  { name: 'overviewInProgress', value: 2, color: 'var(--dsw-alias-state-business-primary)' },
  { name: 'overviewCompleted', value: 1, color: 'var(--dsw-alias-state-success-primary)' },
  { name: 'overviewBlocked', value: 1, color: 'var(--dsw-alias-state-error-primary)' },
]

export function Overview(): ReactNode {
  const { t } = useTranslation()
  const { go: navigate, setOverviewView, receivePanel } = useActions()
  const [answerState, answer] = useAsyncFn(async (id: string, text: string) => {
    const result = await postApiNexusAsksIdAnswers({ id: encodeURIComponent(id) }, { answer: text })
    if (!result || result.id !== id || result.answeredBy !== 'user')
      throw new Error('答复提交失败，问题可能已处理')
    const next = await getApiNexusPanel()
    if (!next || !next.inbox)
      throw new Error('答复已提交，刷新问题列表失败')
    receivePanel(next)
  })
  const view = useStore(state => state.overview.view)
  const panel = useStore(state => state.data.panel)
  const tickets = panel?.tickets ?? []
  const channels = (panel?.channels ?? []).map(channel => ({ kind: channel.kind, name: channel.name, connected: channel.status === 'online' }))
  const now = Date.now()
  const triggers = (panel?.topics.triggers ?? []).filter(trigger => Date.parse(trigger.at) >= now - 86400000 && Date.parse(trigger.at) <= now)
  const metrics = { received: triggers.length, filtered: triggers.filter(trigger => !trigger.mentioned).length, rate: triggers.filter(trigger => Date.parse(trigger.at) >= now - 3600000).length, added: tickets.filter(ticket => Date.parse(ticket.createdAt) >= now - 86400000).length }
  const segments = OVERVIEW_TASK_SEGMENTS.map(segment => ({ ...segment, value: tickets.filter(ticket => segment.name === 'overviewCompleted' ? ticket.status === 'done' : segment.name === 'overviewBlocked' ? Boolean(ticket.paused || ticket.prepareError) : ['running', 'queued', 'review'].includes(ticket.status) && !ticket.paused && !ticket.prepareError).length }))
  const id = useId().replaceAll(':', '')
  const tabs: [SegmentedTab<OverviewView>, SegmentedTab<OverviewView>] = [
    { value: 'recent', label: t('overviewRecent'), id: `${id}-recent`, panelId: `${id}-recent-panel` },
    { value: 'hierarchy', label: t('overviewHierarchy'), id: `${id}-hierarchy`, panelId: `${id}-hierarchy-panel` },
  ]
  return (
    <div className="@container flex flex-col gap-7 pb-10">
      <div className="grid grid-cols-1 gap-4 @min-[800px]:grid-cols-3">
        <SummaryCard title={t('overviewChannels')} meta={`${channels.filter(channel => channel.connected).length}/${channels.length}`} icon={<ChannelsIcon width={18} height={18} className="shrink-0" />} actionLabel={t('overviewMoreChannels')} onMore={() => navigate('channel')}>
          {!panel || channels.length ? <div className="mt-auto grid min-h-[83px] grid-cols-3 gap-2.5">{channels.slice(0, 3).map(channel => <ChannelTile key={channel.name} channel={channel} />)}</div> : <Empty title={t('overviewChannelsEmpty')} description={t('overviewChannelsEmptyDescription')} icon={<ChannelsIcon width={24} height={24} />} />}
          <p className="mt-auto pt-3 text-xs leading-5 text-[var(--dsw-alias-label-tertiary)]">{t('overviewOtherChannel')}</p>
        </SummaryCard>
        <SummaryCard
          title={t('overviewReceived')}
          meta={t('overviewLastDay')}
          icon={<ActivityIcon width={18} height={18} className="shrink-0" />}
          actionLabel={t('overviewMoreActivity')}
          onMore={() => navigate('trigger')}
          background={<ActivityChart />}
        >
          <p aria-label={`${t('overviewReceived')} ${metrics.rate}${t('overviewPerHour')}`} className="flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[32px] leading-10 font-semibold tracking-tight">{metrics.rate}</span>
            <span className="text-sm text-[var(--dsw-alias-label-secondary)]">{t('overviewPerHour')}</span>
          </p>
          <dl className="mt-auto flex flex-col gap-1 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">
            <div className="flex gap-2">
              <dt>{t('overviewTotalMessages')}</dt>
              <dd className="tabular-nums">{`${metrics.received} ${t('overviewItems')}`}</dd>
            </div>
            <div className="flex gap-2">
              <dt>{t('overviewFiltered')}</dt>
              <dd className="tabular-nums">{`${metrics.filtered} ${t('overviewItems')}`}</dd>
            </div>
          </dl>
        </SummaryCard>
        <SummaryCard title={t('overviewTaskSummary')} icon={<TasksIcon width={18} height={18} className="shrink-0" />} actionLabel={t('overviewMoreTasks')} onMore={() => navigate('ticket')}>
          <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
            <div className="flex h-full min-w-0 flex-col">
              <p className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-[32px] leading-10 font-semibold tracking-tight">{metrics.added}</span>
                <span className="text-xs text-[var(--dsw-alias-label-secondary)]">{t('overviewAdded')}</span>
              </p>
              <dl className="mt-auto grid grid-cols-[auto_max-content] gap-x-5 gap-y-1 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">
                {segments.map(segment => (
                  <div key={segment.name} className="col-span-2 grid grid-cols-subgrid items-center whitespace-nowrap">
                    <dt className="flex items-center gap-2">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: segment.color }} />
                      {t(segment.name)}
                    </dt>
                    <dd className="m-0 text-right tabular-nums">{segment.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <TaskChart segments={segments} />
          </div>
        </SummaryCard>
      </div>
      {(panel?.inbox.pending.some(message => message.kind === 'ask') || answerState.error) && (
        <details className="flex flex-col gap-3 rounded-2xl border border-[var(--dsw-alias-border-l3)] p-5" aria-label="待答问题">
          <summary className="cursor-pointer text-sm font-medium">待答问题</summary>
          {panel?.inbox.pending.filter(message => message.kind === 'ask').map(message => (
            <form
              key={message.id}
              className="flex flex-col gap-2 border-t border-[var(--dsw-alias-border-l3)] pt-3"
              onSubmit={(event) => {
                event.preventDefault()
                void answer(message.id, String(new FormData(event.currentTarget).get('answer') ?? ''))
              }}
            >
              <p className="m-0 whitespace-pre-wrap">{message.message}</p>
              <div className="flex gap-2">
                <Input name="answer" required aria-label="答复内容" disabled={answerState.loading} />
                <Button type="submit" size="sm" variant="primary" disabled={answerState.loading}>提交答复</Button>
              </div>
            </form>
          ))}
          {answerState.error && <p role="alert">{answerState.error.message}</p>}
        </details>
      )}
      <section aria-label={t('overviewTaskViews')}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs size="sm" value={view} onChange={setOverviewView} items={tabs} label={t('overviewTaskViews')} />
          <span title={panel?.run.reason ?? undefined}><Tag tone={panel?.run.state === 'delivery_failed' ? 'danger' : 'quiet'}>{t(panel?.run.state === 'running' ? 'graphRunning' : panel?.run.state === 'queued' ? 'graphQueued' : panel?.run.state === 'delivery_failed' ? 'graphDeliveryFailed' : 'graphIdle')}</Tag></span>
        </div>
        <div id={`${id}-${view}-panel`} role="tabpanel" aria-labelledby={`${id}-${view}`} tabIndex={0} className="rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)]">
          {view === 'recent' ? tickets.length ? <ul className="pl-0">{tickets.map(task => <Row key={task.id} task={task} />)}</ul> : <Empty title={t('overviewTasksEmpty')} description={t('overviewTasksEmptyDescription')} icon={<TasksIcon width={28} height={28} />} /> : <Graph />}
        </div>
      </section>
    </div>
  )
}
