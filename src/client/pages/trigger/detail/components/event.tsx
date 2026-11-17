import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { EventRecord } from '../../model'
import { Button, MarkdownText, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useId, useMemo, useState } from 'react'
import { useDshContext } from '../../../../hooks/use-dsh-context'
import { useTranslation } from '../../../../hooks/use-translation'
import { KINDS, sourceHref, STATUSES } from '../../model'

export function Event({ event }: { event: EventRecord }): ReactNode {
  const ctx = useDshContext()
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const common = ctx.locale.bind('common')
  const copyLabel = common('copy')
  const copiedLabel = common('copied')
  const footnotes = common('markdown.footnotes')
  const labels = useMemo<MarkdownLabels>(() => ({
    code: { copyLabel, copiedLabel },
    footnotes,
  }), [copyLabel, copiedLabel, footnotes])
  const href = sourceHref(event.channel, event.url)
  const targets = { main: 'graphOrchestrator', project: 'triggerProjectAgent', supervisor: 'graphSupervisor', worker: 'triggerWorkerAgent', user: 'triggerUser' } as const
  return (
    <li className="relative min-w-0 border-l border-[var(--dsw-alias-border-l3)] pb-6 pl-5 last:pb-0">
      <span className="absolute top-1.5 -left-[3.5px] size-1.5 rounded-full bg-[var(--dsw-alias-state-business-primary)]" aria-hidden="true" />
      <article className="min-w-0 rounded-xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-4">
        <header className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{event.actor}</span>
            <Tag tone="neutral">{t(KINDS[event.kind])}</Tag>
            {event.mentioned && <Tag tone="info">{t('triggerMentioned')}</Tag>}
            {!event.human && <span className="text-[var(--dsw-alias-label-tertiary)]">{t('triggerAutomated')}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {event.text && (
              <Button size="sm" variant="ghost" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(value => !value)}>
                {t(expanded ? 'triggerCollapseBody' : 'triggerExpandBody')}
              </Button>
            )}
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" title={t('triggerSampleLink')} className="text-[11px] text-[var(--dsw-alias-state-business-primary)] underline-offset-4 hover:underline focus-visible:underline">
                {t(event.kind === 'comment' ? 'triggerOpenComment' : 'triggerOpenEvent')}
                {' '}
                ↗
              </a>
            )}
            <time dateTime={event.at} title={event.at} className="text-[11px] text-[var(--dsw-alias-label-tertiary)] tabular-nums">
              {event.at.slice(0, 10)}
              {' '}
              ·
              {' '}
              {event.at.slice(11, 16)}
            </time>
          </div>
        </header>
        {event.text && (
          <div id={bodyId} hidden={!expanded} className="my-3 min-w-0 text-[13px] leading-6 text-[var(--dsw-alias-label-primary)] [overflow-wrap:anywhere]">
            {expanded && <MarkdownText text={event.text} labels={labels} />}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--dsw-alias-border-l3)] pt-3 text-xs text-[var(--dsw-alias-label-secondary)]">
          <span>{t('triggerDelivery')}</span>
        </div>
        {event.deliveries.length
          ? (
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                {event.deliveries.map((delivery, index) => (
                  <li key={`${delivery.target}-${delivery.project ?? index}`} className="text-xs leading-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{t(targets[delivery.target])}</span>
                      {delivery.project && <span className="break-all text-[var(--dsw-alias-label-tertiary)]">{delivery.project}</span>}
                      <Tag tone={STATUSES[delivery.status].tone}>{t(STATUSES[delivery.status].label)}</Tag>
                    </div>
                    {delivery.status === 'pending' && <span className="block text-[11px] text-[var(--dsw-alias-label-secondary)]">{t(delivery.read ? 'triggerReadPending' : 'triggerQueued')}</span>}
                    {delivery.error && (
                      <p className="m-0 mt-1 text-[11px] text-[var(--dsw-alias-state-error-primary)]">
                        {delivery.error}
                        {' '}
                        ·
                        {' '}
                        {t('triggerAttempts', { count: delivery.attempts })}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )
          : <p className="mb-0 mt-2 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t(event.skipped === 'ignored' ? 'triggerSkipIgnored' : event.skipped === 'not-mentioned' ? 'triggerSkipMention' : 'triggerNoDelivery')}</p>}
        {event.ref && (
          <p className="mb-0 mt-3 break-all text-[11px] text-[var(--dsw-alias-label-secondary)]">
            {t('triggerRef')}
            :
            {' '}
            <code>{event.ref}</code>
          </p>
        )}
      </article>
    </li>
  )
}
