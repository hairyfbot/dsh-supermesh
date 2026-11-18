import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReactNode } from 'react'
import { Button, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshChannel, getApiSupermeshGroup, getApiSupermeshTicketId } from '../../../apis'
import { Empty } from '../../../components/empty'
import { ActivityIcon, ArrowLeftIcon, ChannelsIcon, GitBranchIcon, GitHubIcon, SupermeshIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useDshContext } from '../../../hooks/use-dsh-context'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { Arrivals } from './components/arrivals'
import { Issues } from './components/issues'
import { Metric } from './components/metric'
import { PrStatus } from './components/pr-status'
import { Relations } from './components/relations'
import { Section } from './components/section'

export function TicketDetail(): ReactNode {
  const { t } = useTranslation()
  const ctx = useDshContext()
  const { go } = useActions()
  const { ticketId, returnTo } = useStore(state => state.navigation)
  const { data: stored, isLoading, error } = useQuery({ queryKey: keys.ticketDetail(ticketId ?? ''), queryFn: () => getApiSupermeshTicketId({ id: ticketId ?? '' }), enabled: Boolean(ticketId) })
  const { data: channelList } = useQuery({ queryKey: keys.channel, queryFn: () => getApiSupermeshChannel() })
  const { data: groupList } = useQuery({ queryKey: keys.group, queryFn: () => getApiSupermeshGroup(), refetchInterval: 15_000 })
  const detail = stored?.ticket?.id === ticketId ? stored : null
  const task = detail?.ticket
  const unavailable = stored !== undefined && !detail
  const latest = detail?.executions.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
  const channel = channelList?.find(channel => channel.id === task?.channelId)
  const seconds = task?.status !== 'waiting' && task?.startedAt ? Math.max(0, Math.floor((new Date(task.endedAt ?? new Date()).getTime() - new Date(task.startedAt).getTime()) / 1000)) : null
  const supervisors = [...new Set(detail?.inbox.map(message => message.supervisorId).filter((id): id is string => Boolean(id)))].map(id => ({ id, group: groupList?.find(group => group.id === `supervisor:${id}`) }))
  const labels = { waiting: t('overviewStatusWaiting'), queued: t('ticketStatusQueued'), running: t('overviewStatusRunning'), review: t('overviewStatusReview'), done: t('overviewCompleted'), cancelled: t('ticketStatusCancelled') }
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10" aria-label={t('ticketDetail')}>
      <div><Button variant="ghost" size="sm" icon={<ArrowLeftIcon width={16} height={16} />} onClick={() => go(returnTo)}>{t('ticketBack')}</Button></div>
      {isLoading && <p role="status">加载中…</p>}
      {(error || unavailable) && <p role="alert">{error instanceof Error ? error.message : '任务不存在或无法读取'}</p>}
      {!task && !isLoading && !error && !unavailable && <Empty title={t('ticketNotFound')} description={t('ticketNotFoundDescription')} icon={<SupermeshIcon width={28} height={28} />} />}
      {task && detail && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="text-xs text-[var(--dsw-alias-label-tertiary)]">{task.id}</span>
                <Tag tone={task.prepareError || task.paused ? 'danger' : task.status === 'done' ? 'success' : task.status === 'running' ? 'info' : task.status === 'review' ? 'warning' : 'quiet'}>{task.paused ? t('ticketStatusPaused') : task.prepareError ? t('overviewStatusIntervention') : labels[task.status]}</Tag>
              </div>
              <h2 className="m-0 text-lg leading-7 font-medium [overflow-wrap:anywhere]">{task.title}</h2>
            </div>
            <div className="flex min-w-0 flex-col items-end gap-1.5">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <PrStatus ticket={task} />
                {latest?.id && (latest.status === 'running' || latest.startedAt) && <Button variant="outline" size="sm" onClick={() => ctx.uiWorkspace.openSession(latest.id as SessionId)}>{t('overviewOpenSession')}</Button>}

              </div>
            </div>
          </header>
          {task.prepareError && <p role="alert">{task.prepareError}</p>}
          <dl className="m-0 grid min-w-0 gap-3 @min-[460px]:grid-cols-2 @min-[820px]:grid-cols-4">
            <Metric label={t('ticketProject')} icon={<SupermeshIcon width={17} height={17} />}>
              {detail.project
                ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5" title={detail.project.directory}>
                      {task.channelId === 'github' && <GitHubIcon width={14} height={14} className="shrink-0" />}
                      <span className="truncate">{detail.project.name}</span>
                    </span>
                  )
                : <Empty inline title={t('ticketProjectEmpty')} className="font-normal" />}
            </Metric>
            <Metric label={t('ticketChannel')} icon={<ChannelsIcon width={17} height={17} />}>
              {channel?.name ?? task.channelId}
              {channel && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-normal text-[var(--dsw-alias-label-secondary)]">
                  <StateDot state={channel.status === 'online' ? 'done' : 'idle'} size={6} />
                  {t(channel.status === 'online' ? 'ticketChannelConnected' : 'overviewDisconnected')}
                </span>
              )}
            </Metric>
            <Metric label={t(task.status === 'waiting' ? 'ticketWaitDuration' : 'ticketExecutionDuration')} icon={<ActivityIcon width={17} height={17} />}>{seconds !== null ? <span className="tabular-nums">{seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}</span> : <Empty inline title={t('ticketDurationUnknown')} className="font-normal" />}</Metric>
            <Metric label={t('ticketExecutionBranch')} icon={<GitBranchIcon width={17} height={17} />}>{latest?.branch ? <span className="min-w-0 truncate font-mono text-xs" title={latest.branch}>{latest.branch}</span> : <Empty inline title={t('ticketBranchPending')} className="font-normal" />}</Metric>
          </dl>
          <div className="grid min-w-0 gap-4 @min-[740px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Issues issues={detail.topics.filter(topic => topic.kind === 'issue')} />
              <Section title={t('ticketDependencies')}><Relations links={detail.dependencies.filter(link => link.kind === 'depends')} ticketId={task.id} empty={t('ticketDependenciesEmpty')} clear /></Section>
              <Section title={t('ticketRelatedTasks')}><Relations links={detail.dependencies.filter(link => link.kind === 'relates')} ticketId={task.id} empty={t('ticketRelatedTasksEmpty')} /></Section>
            </div>
            <div className="grid min-w-0 grid-rows-[auto_1fr] gap-4">
              <Section title={t('graphSupervisor')}>
                {supervisors.length
                  ? (
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {supervisors.map(({ id, group }) => (
                          <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 text-[13px] [overflow-wrap:anywhere]">{group?.label ?? id}</span>
                            {group?.sessionId && <Button size="sm" variant="outline" onClick={() => ctx.uiWorkspace.openSession(group.sessionId as SessionId)}>{t('overviewOpenSession')}</Button>}
                          </li>
                        ))}
                      </ul>
                    )
                  : <Empty inline title={t('ticketSupervisorEmpty')} />}
              </Section>
              <Section title={t('ticketArrivals')}><Arrivals key={task.id} triggers={detail.triggers} inbox={detail.inbox} /></Section>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
