import type { ReactNode } from 'react'
import type { OverviewChannelKind } from '../../../types'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { ChannelsIcon, FeishuIcon, GitHubIcon, GitLabIcon } from '../../../components/icons'
import { OVERVIEW_CHANNEL_LABELS } from '../../../constants'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function Card({ kind }: { kind: OverviewChannelKind }): ReactNode {
  const { t } = useTranslation()
  const { openChannel } = useActions()
  const channel = useStore(state => state.data.panel?.channels.find(channel => channel.id === kind))
  const connected = channel?.enabled && channel.accounts.some(account => account.status === 'online')
  const name = channel?.name ?? OVERVIEW_CHANNEL_LABELS[kind] ?? kind
  const Icon = { github: GitHubIcon, gitlab: GitLabIcon, feishu: FeishuIcon }[kind] ?? ChannelsIcon
  const description = { github: 'channelGithubDescription', gitlab: 'channelGitlabDescription', feishu: 'channelFeishuDescription' } as const
  return (
    <button type="button" onClick={() => openChannel(kind)} aria-label={`${name} · ${t('channelSettings')}`} className="group flex min-h-48 min-w-0 cursor-pointer flex-col gap-4 rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-5 text-left font-[inherit] outline-none transition-colors hover:border-[var(--dsw-alias-border-l1)] hover:bg-[var(--dsw-alias-card-fill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)]">
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--dsw-alias-card-fill)]"><Icon width={27} height={27} /></span>
        <Tag tone="quiet">{connected ? '已连接' : channel?.enabled ? '已开启' : '已关闭'}</Tag>
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--dsw-alias-label-primary)]">{name}</span>
        <span className="text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{description[kind] ? t(description[kind]) : channel?.id}</span>
      </span>
      <span className="mt-auto text-xs text-[var(--dsw-alias-state-business-primary)] underline-offset-4 group-hover:underline">{t('channelSettings')}</span>
    </button>
  )
}
