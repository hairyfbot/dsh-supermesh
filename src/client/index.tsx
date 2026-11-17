import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { ClientContext } from './types/context'
import { NexusIcon } from './components/icons'
import { PluginContext } from './config/context'
import { dicts } from './locale'
import { Panel as NexusPanel } from './panel'
import { store } from './store'
import { Notification } from './ui/mailbox/notification'
import { Panel as MailboxPanel } from './ui/mailbox/panel'

type MailboxNoticeEvent = Extract<SessionEvent, { type: 'user/message' }>

const PANEL_ID = 'dsh-nexus' as MainPanelId
const NS = 'dshNexus' as const

export const inject = ['slots', 'locale', 'sessions', 'layout', 'uiWorkspace', 'uiConversation']

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, dicts),
    `${NS}: dictionaries`,
  )

  const definition: ConversationNodeDefinition<MailboxNoticeEvent> = {
    kind: 'nexus-mailbox-notification',
    target: 'chat',
    match: event => event.type === 'user/message' && event.data.source.kind === 'nexus-mailbox' && event.data.source.form === 'notice'
      ? { id: String(event.data.id), role: 'start', exclusive: true }
      : null,
    start: (_, match) => match.event as MailboxNoticeEvent,
    update: context => context.state,
    buildViewNode: context => context.state && context.start
      ? {
          key: context.key,
          kind: 'nexus-mailbox-notification',
          id: context.id,
          target: 'chat',
          anchorSeq: context.state.seq,
          location: context.start.location,
          visibility: 'visible',
          groupTree: 'input',
          data: context.state,
        }
      : null,
  }
  ctx.effect(() => ctx.uiConversation.events.register(definition), 'nexus:mailbox-notification')

  const t = ctx.locale.bind(NS)

  ctx.slots.inject('main', () => ctx.slots.register(
    {
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      store,
    },
    props => (
      <PluginContext.Provider value={{
        ctx,
        t: props.t,
        useStore: props.useStore,
        actions: props.actions,
      }}
      >
        <NexusPanel />
      </PluginContext.Provider>
    ),
  ))

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
    { name: 'conversation.chat.node', key: 'nexus-mailbox-notification', locale: NS },
    props => (
      <PluginContext.Provider value={{ ctx, t: props.t }}>
        <Notification node={props.node} />
      </PluginContext.Provider>
    ),
  ))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    { name: 'conversation.input.dock', id: 'nexus-mailbox', order: 1, locale: NS },
    props => (
      <PluginContext.Provider key={props.sessionId} value={{ ctx, t: props.t }}>
        <MailboxPanel sessionId={props.sessionId} />
      </PluginContext.Provider>
    ),
  ))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    {
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 10,
      label: () => t('panel'),
      locale: NS,
    },
    ({ size }) => <NexusIcon width={size} height={size} />,
  ))
}
