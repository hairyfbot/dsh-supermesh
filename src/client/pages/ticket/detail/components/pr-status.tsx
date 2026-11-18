import type { ReactNode } from 'react'
import type { GetApiSupermeshTicketidResponse } from '../../../../apis/index.type'
import { PullRequestClosedIcon, PullRequestIcon, PullRequestMergedIcon } from '../../../../components/icons'
import { useTranslation } from '../../../../hooks/use-translation'

export function PrStatus({ ticket }: { ticket: Pick<GetApiSupermeshTicketidResponse['ticket'], 'prUrl' | 'prState' | 'ciState'> }): ReactNode {
  const { t } = useTranslation()
  if (!ticket.prUrl || !/^https?:\/\//i.test(ticket.prUrl))
    return null
  const blocked = ticket.prState === 'open' && ticket.ciState === 'failing'
  const appearance = {
    open: { Icon: PullRequestIcon, color: 'var(--dsw-alias-state-success-primary)', label: 'ticketPrOpen' },
    blocked: { Icon: PullRequestIcon, color: 'var(--dsw-alias-state-warn-primary)', label: 'ticketPrBlocked' },
    merged: { Icon: PullRequestMergedIcon, color: 'var(--dsw-alias-state-done-primary)', label: 'ticketPrMerged' },
    closed: { Icon: PullRequestClosedIcon, color: 'var(--dsw-alias-state-error-primary)', label: 'ticketPrClosed' },
    unknown: { Icon: PullRequestIcon, color: 'var(--dsw-alias-label-tertiary)', label: null },
  } as const
  const { Icon, color, label } = appearance[blocked ? 'blocked' : ticket.prState ?? 'unknown']
  const number = ticket.prUrl.match(/\/pull\/(\d+)/)?.[1]
  const description = [number ? `PR #${number}` : 'PR', label ? t(label) : ''].filter(Boolean).join(' · ')
  return (
    <a href={ticket.prUrl} target="_blank" rel="noreferrer" aria-label={t('overviewOpenPr')} title={description} className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-card-fill)] px-2.5 text-xs leading-4 font-medium text-[var(--dsw-alias-label-primary)] no-underline outline-none transition-colors hover:bg-[var(--dsw-alias-interactive-bg-hover)] active:bg-[var(--dsw-alias-interactive-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)]">
      <Icon width={12} height={12} style={{ color }} />
      <span className="tabular-nums">{number ? `PR #${number}` : 'PR'}</span>
      {label && <span className="text-[11px] font-normal text-[var(--dsw-alias-label-secondary)]">{t(label)}</span>}
    </a>
  )
}
