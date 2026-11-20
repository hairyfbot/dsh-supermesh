import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

import type { ClientContext } from '@/client/types/context'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { getApiSupermeshSessionRole } from '@/client/apis'
import { client } from '@/client/client'
import { AgentIcon, GitForkIcon, Layers2Icon, SupermeshIcon, UsersRoundIcon } from '@/client/components/icons'
import { PluginContext } from '@/client/config/context'
import { keys } from '@/client/config/query-keys'
import { dicts } from '@/client/locale'
import { Panel as SupermeshPanel } from '@/client/panel'
import { store } from '@/client/store'
import { Notification } from '@/client/ui/mailbox/notification'
import { Panel as MailboxPanel } from '@/client/ui/mailbox/panel'

type MailboxNoticeEvent = Extract<SessionEvent, { type: 'user/message' }>

function SessionRoleIcon({ sessionId }: { sessionId: string }) {
  const { data } = useQuery({ queryKey: keys.sessionRole, queryFn: () => getApiSupermeshSessionRole() })
  const role = data?.sessions.find(session => session.sessionId === sessionId)?.role
  if (role === 'main')
    return <GitForkIcon />
  if (role === 'project')
    return <Layers2Icon />
  if (role === 'supervisor')
    return <UsersRoundIcon />
  if (role === 'worker')
    return <AgentIcon />
  return null
}

const PANEL_ID = 'dsh-supermesh' as MainPanelId
const NS = 'dshSupermesh' as const

export const inject = ['slots', 'locale', 'sessions', 'layout', 'uiWorkspace', 'uiConversation']

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(NS, dicts),
    `${NS}: dictionaries`,
  )

  const definition: ConversationNodeDefinition<MailboxNoticeEvent> = {
    kind: 'supermesh-mailbox-notification',
    target: 'chat',
    match: event => event.type === 'user/message' && event.data.source.kind === 'supermesh-mailbox' && event.data.source.form === 'notice'
      ? { id: String(event.data.id), role: 'start', exclusive: true }
      : null,
    start: (_, match) => match.event as MailboxNoticeEvent,
    update: context => context.state,
    buildViewNode: context => context.state && context.start
      ? {
          key: context.key,
          kind: 'supermesh-mailbox-notification',
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
  ctx.effect(() => ctx.uiConversation.events.register(definition), 'supermesh:mailbox-notification')

  const t = ctx.locale.bind(NS)

  ctx.slots.inject('main', () => ctx.slots.register(
    {
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      store,
    },
    props => (
      <QueryClientProvider client={client}>
        <PluginContext.Provider value={{
          ctx,
          t: props.t,
          useStore: props.useStore,
          actions: props.actions,
        }}
        >
          <SupermeshPanel />
        </PluginContext.Provider>
      </QueryClientProvider>
    ),
  ))

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
    { name: 'conversation.chat.node', key: 'supermesh-mailbox-notification', locale: NS },
    props => (
      <PluginContext.Provider value={{ ctx, t: props.t }}>
        <Notification node={props.node} />
      </PluginContext.Provider>
    ),
  ))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
    { name: 'conversation.input.dock', id: 'supermesh-mailbox', order: 1, locale: NS },
    props => (
      <PluginContext.Provider key={props.sessionId} value={{ ctx, t: props.t }}>
        <MailboxPanel sessionId={props.sessionId} />
      </PluginContext.Provider>
    ),
  ))

  ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register(
    {
      name: 'sidebar.session.row.leading',
      id: `${PANEL_ID}:role-icon`,
      order: 10,
      locale: NS,
    },
    props => (
      <QueryClientProvider client={client}>
        <PluginContext.Provider value={{ ctx, t: props.t }}>
          <SessionRoleIcon sessionId={props.sessionId} />
        </PluginContext.Provider>
      </QueryClientProvider>
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
    ({ size }) => <SupermeshIcon width={size} height={size} />,
  ))
}
