import type { SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReactNode } from 'react'
import type { Page, TabKind } from './store'
import { Button, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsyncFn } from '@reause/core'
import { useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'
import { Case, Switch } from 'react-if-lite'
import { putApiSupermeshSessionMain } from './apis'
import { useDshContext } from './hooks/use-dsh-context'
import { useActions, useStore } from './hooks/use-store'
import { useTranslation } from './hooks/use-translation'
import { ChannelDetail } from './pages/channel/detail/page'
import { Channel } from './pages/channel/page'
import { Overview } from './pages/overview/page'
import { Setting } from './pages/setting/page'
import { TicketDetail } from './pages/ticket/detail/page'
import { Ticket } from './pages/ticket/page'
import { TriggerDetail } from './pages/trigger/detail/page'
import { Trigger } from './pages/trigger/page'

const TABS = [
  { kind: 'overview', label: 'tabOverview' },
  { kind: 'ticket', label: 'tabTickets' },
  { kind: 'trigger', label: 'tabTriggers' },
  { kind: 'channel', label: 'tabChannels' },
  { kind: 'setting', label: 'tabSettings' },
] as const

function tabOf(page: Page): TabKind {
  return page.split('/')[0] as TabKind
}

export function Panel(): ReactNode {
  const { t } = useTranslation()
  const ctx = useDshContext()
  const [opening, openMain] = useAsyncFn(async () => {
    const navigation = ctx.layout.beginNavigation()
    const result = await putApiSupermeshSessionMain()
    if (!result || typeof result.sessionId !== 'string' || !result.sessionId.trim())
      throw new Error(result && 'message' in result && typeof result.message === 'string' ? result.message : '打开主会话失败')
    if (!navigation.aborted)
      ctx.uiWorkspace.openSession(result.sessionId as SessionId)
  })
  const client = useQueryClient()
  const [refreshing, refresh] = useAsyncFn(async () => {
    await client.invalidateQueries()
  })
  const selectedTicketId = useStore(state => state.navigation.ticketId)
  const page = useStore(state => state.navigation.page)
  const { go: navigate } = useActions()
  const tabsId = useId().replaceAll(':', '')
  const items = TABS.map(tab => ({ value: tab.kind, label: t(tab.label), id: `${tabsId}-${tab.kind}`, panelId: `${tabsId}-${tab.kind}-panel` })) as [SegmentedTab<TabKind>, ...SegmentedTab<TabKind>[]]
  const tab = tabOf(page)
  return (
    <section className="box-border flex h-full min-h-0 w-full min-w-0 max-w-full flex-col items-center overflow-y-auto px-[clamp(20px,4vw,48px)] text-[13px] leading-5 text-(--dsw-alias-label-primary) [&_*]:box-border" style={{ fontFamily: 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif)' }}>
      <header className="flex w-full min-w-0 max-w-270 flex-none flex-col gap-5 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl leading-7 font-semibold">{t('title')}</h1>
            <p className="mt-1 text-[13px] leading-5 text-(--dsw-alias-label-secondary)">{t('desc')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={refreshing.loading} onClick={() => void refresh()}>{refreshing.loading ? '刷新中…' : '刷新'}</Button>
            <Button variant="outline" size="sm" disabled={opening.loading} onClick={() => void openMain()}>{t('openMainSession')}</Button>
          </div>
        </div>
        <div className="w-full min-w-0 overflow-x-auto"><SegmentedTabs size="sm" items={items} value={tab} onChange={navigate} label={t('tabsLabel')} className="w-fit" /></div>
      </header>
      <div id={`${tabsId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className="mt-6 flex w-full min-w-0 max-w-270 flex-none flex-col gap-6">
        {opening.error && <p role="alert">{opening.error.message}</p>}
        <Switch value={page}>
          <Case cond="overview"><Overview /></Case>
          <Case cond="ticket"><Ticket /></Case>
          <Case cond="ticket/detail"><TicketDetail key={selectedTicketId ?? 'none'} /></Case>
          <Case cond="trigger"><Trigger /></Case>
          <Case cond="trigger/detail"><TriggerDetail /></Case>
          <Case cond="channel"><Channel /></Case>
          <Case cond="channel/detail"><ChannelDetail /></Case>
          <Case cond="setting"><Setting /></Case>
        </Switch>
      </div>
    </section>
  )
}
