import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '../../../types/mailbox'
import { IconChevronDownOutlineRegular, IconContextInjectionOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useId, useState } from 'react'
import { useTranslation } from '../../hooks/use-translation'

type NoticeEvent = Extract<SessionEvent, { type: 'user/message' }>

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'supermesh-mailbox-notification': NoticeEvent
  }
}

export function Notification({ node }: Pick<ChatNodeViewProps<'supermesh-mailbox-notification'>, 'node'>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const date = new Date(node.data.time)
  return (
    <section className="min-w-0 rounded-[var(--dsw-radius-xl)] border-[0.5px] border-solid border-[var(--dsw-alias-border-l1)] bg-[var(--dsw-alias-turn-trigger-bg,var(--dsw-alias-markdown-code-block))] transition-colors duration-100 ease-[ease] hover:bg-[var(--dsw-alias-turn-trigger-bg-hover,var(--dsw-alias-interactive-bg-hover))] motion-reduce:transition-none" data-turn-trigger>
      <button className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-4 py-3 text-left text-[var(--dsw-alias-label-tertiary)] [font:inherit] transition-colors duration-100 ease-[ease] hover:text-[var(--dsw-alias-label-secondary)] motion-reduce:transition-none" type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span className="inline-flex shrink-0 text-inherit" aria-hidden><IconContextInjectionOutlineRegular size={14} /></span>
        <span className="min-w-0 flex-1 text-[length:var(--dsh-content-font-size,14px)] [overflow-wrap:anywhere]">{t('mailboxNotification')}</span>
        <time className="ml-auto shrink-0 text-inherit [font:var(--dsw-font-xxs-12)]" dateTime={date.toISOString()}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        <IconChevronDownOutlineRegular size={12} className={open ? 'shrink-0 rotate-180 text-inherit' : 'shrink-0 text-inherit'} />
      </button>
      {open && (
        <div id={bodyId} className="pb-3 pl-10 pr-4">
          <p className="my-2 text-[var(--dsw-alias-label-secondary)] [font:var(--dsw-font-xxs-12)]">{t('mailboxNotificationDescription')}</p>
          <div className="max-h-60 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] [font:var(--dsw-font-xxs-12)]">
            <p className="m-0 whitespace-pre-wrap text-[var(--dsw-alias-label-secondary)] [font:inherit] [overflow-wrap:anywhere]">{node.data.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n')}</p>
          </div>
        </div>
      )}
    </section>
  )
}
