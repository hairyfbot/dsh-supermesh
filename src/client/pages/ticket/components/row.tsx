import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReactNode } from 'react'
import type { GetApiSupermeshChannelResponse, GetApiSupermeshNodeResponse, GetApiSupermeshSubscriptionResponse, GetApiSupermeshTicketidResponse, GetApiSupermeshTriggerResponse } from '../../../apis/index.type'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { TasksIcon } from '../../../components/icons'
import { useDshContext } from '../../../hooks/use-dsh-context'
import { useActions } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function Row({ task, nodes, channels, triggers, subscriptions, refreshedAt }: {
  task: GetApiSupermeshTicketidResponse['ticket']
  nodes: GetApiSupermeshNodeResponse
  channels: GetApiSupermeshChannelResponse
  triggers: GetApiSupermeshTriggerResponse
  subscriptions: GetApiSupermeshSubscriptionResponse
  refreshedAt: string | null
}): ReactNode {
  const { t } = useTranslation()
  const { openTicket } = useActions()
  const ctx = useDshContext()
  const sessions = nodes.filter(node => node.ticketId === task.id && node.sessionId)
  const session = sessions.find(node => node.status === 'running') ?? sessions.at(-1)
  const channel = channels.find(channel => channel.id === task.channelId)
  const status = {
    waiting: { label: 'overviewStatusWaiting', tone: 'quiet' },
    queued: { label: 'ticketStatusQueued', tone: 'quiet' },
    running: { label: 'overviewStatusRunning', tone: 'info' },
    review: { label: 'overviewStatusReview', tone: 'warning' },
    done: { label: 'overviewCompleted', tone: 'success' },
    cancelled: { label: 'ticketStatusCancelled', tone: 'quiet' },
  } as const
  const intervention = Boolean(task.prepareError || task.paused)
  const ticketSubscriptions = subscriptions.filter(subscription => subscription.ticketId === task.id)
  const trigger = triggers
    .filter(trigger => ticketSubscriptions.some(subscription => subscription.threadId === trigger.threadId))
    .toSorted((a, b) => b.at.localeCompare(a.at))[0]
  const prUrl = task.prUrl && /^https?:\/\//i.test(task.prUrl) ? task.prUrl : null
  const prNumber = prUrl?.match(/\/(?:pull|merge_requests)\/(\d+)(?:[/?#]|$)/)?.[1]
  const event = prNumber ? `PR #${prNumber}${task.prState ? ` ${task.prState}` : ''}` : trigger ? `${trigger.ref ?? ''} ${trigger.kind}`.trim() : null
  const start = task.status === 'waiting' ? null : task.startedAt
  const end = task.endedAt ?? (start ? refreshedAt : null)
  const seconds = start && end ? Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000)) : Number.NaN
  const duration = Number.isFinite(seconds) ? `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ` : ''}${seconds >= 60 ? `${Math.floor(seconds / 60) % 60}m ` : ''}${seconds % 60}s` : null
  return (
    <li className="flex flex-col gap-3 border-b border-[var(--dsw-alias-border-l3)] py-5 last:border-b-0 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between @min-[640px]:gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-[var(--dsw-alias-label-tertiary)]"><TasksIcon width={17} height={17} /></span>
        <div className="min-w-0">
          <h3 className="text-[13px] leading-5 font-medium [overflow-wrap:anywhere] m-0">
            <span className="mr-2 text-xs font-normal text-[var(--dsw-alias-label-tertiary)]">{task.id}</span>
            {task.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">
            <Tag tone={intervention ? 'danger' : status[task.status].tone}>{t(task.paused ? 'ticketStatusPaused' : task.prepareError ? 'overviewStatusIntervention' : status[task.status].label)}</Tag>
            {intervention
              ? <span>{task.prepareError ?? t('ticketStatusPaused')}</span>
              : (
                  <>
                    <span>{`${t('overviewSource')}: ${channel?.name ?? task.channelId}`}</span>
                    {event && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{event}</span>
                      </>
                    )}
                    {task.status === 'waiting' && session?.status === 'running' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t('overviewTriggerRunning')}</span>
                      </>
                    )}
                    {(duration || task.status === 'waiting') && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{`${t(task.status === 'waiting' ? 'ticketWaitDuration' : 'ticketExecutionDuration')}: ${duration ?? t('ticketDurationUnknown')}`}</span>
                      </>
                    )}
                  </>
                )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[29px] @min-[640px]:pl-0">
        {prUrl && <Button size="sm" variant="outline" onClick={() => window.open(prUrl, '_blank', 'noopener,noreferrer')}>{t('overviewOpenPr')}</Button>}
        {session?.sessionId && <Button size="sm" variant="outline" onClick={() => ctx.uiWorkspace.openSession(session.sessionId as SessionId)}>{t('overviewOpenSession')}</Button>}
        <Button size="sm" variant="primary" aria-label={`${t('overviewOpenDetails')} ${task.id}`} onClick={() => openTicket(task.id)}>{t('overviewOpenDetails')}</Button>
      </div>
    </li>
  )
}
