import type { ReactNode } from 'react'
import type { GetApiSupermeshTicketidResponse } from '../../../../apis/index.type'
import { Empty } from '../../../../components/empty'
import { IssueOpenIcon } from '../../../../components/icons'
import { useActions } from '../../../../hooks/use-store'
import { useTranslation } from '../../../../hooks/use-translation'
import { Section } from './section'

export function Issues({ issues }: { issues: GetApiSupermeshTicketidResponse['topics'] }): ReactNode {
  const { t } = useTranslation()
  const { openThread } = useActions()
  return (
    <Section title={t('ticketIssues')} meta={issues.length > 0 && <span className="text-xs font-normal text-[var(--dsw-alias-label-tertiary)]">{issues.length}</span>}>
      {issues.length
        ? (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {issues.map(issue => (
                <li key={issue.id}>
                  <button type="button" className="group/issue flex w-full cursor-pointer items-start gap-2 rounded-md border-0 bg-transparent p-0 text-left text-[13px] leading-5 font-[inherit] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)]" onClick={() => openThread(issue.id)}>
                    <span aria-hidden="true" title="Issue 状态未提供" className="mt-0.5 shrink-0 text-[var(--dsw-alias-label-tertiary)]"><IssueOpenIcon width={14} height={14} /></span>
                    <span className="min-w-0 text-[var(--dsw-alias-label-secondary)] [overflow-wrap:anywhere]">
                      <span className="underline-offset-4 group-hover/issue:underline group-focus-visible/issue:underline">{issue.title}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        : <Empty inline title={t('ticketIssuesEmpty')} />}
    </Section>
  )
}
