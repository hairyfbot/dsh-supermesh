import type { ReactNode } from 'react'
import type { OverviewChannelKind } from '../../../types'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiNexusChannel } from '../../../apis'
import { FeishuIcon, GitHubIcon, GitLabIcon } from '../../../components/icons'
import { keys } from '../../../config/query-keys'
import { useActions } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function Card({ kind }: { kind: OverviewChannelKind }): ReactNode {
  const { t } = useTranslation()
  const { openChannel } = useActions()
  const { data: channels, error, isLoading } = useQuery({ queryKey: keys.channel, queryFn: () => getApiNexusChannel() })
  const channel = channels?.find(channel => channel.id === kind)
  const connected = channel?.status === 'online'
  const configured = channel?.configured ?? Boolean(channel?.accounts.length)
  const status = t(kind === 'feishu' ? 'channelUnsupported' : !configured ? 'channelNotConfigured' : channel?.supported === false || channel?.status === 'unsupported' ? 'channelUnsupported' : connected ? 'channelConnected' : channel?.status === 'disabled' ? 'channelDisabled' : 'overviewDisconnected')
  const name = channel?.name ?? { github: 'GitHub', feishu: '飞书', gitlab: 'GitLab' }[kind]
  const Icon = { github: GitHubIcon, gitlab: GitLabIcon, feishu: FeishuIcon }[kind]
  const description = { github: 'channelGithubDescription', gitlab: 'channelGitlabDescription', feishu: 'channelFeishuDescription' } as const
  return (
    <button type="button" onClick={() => openChannel(kind)} aria-label={`${name} · ${t('channelSettings')}`} className="group flex min-h-48 min-w-0 cursor-pointer flex-col gap-4 rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-5 text-left font-[inherit] outline-none transition-colors hover:border-[var(--dsw-alias-border-l1)] hover:bg-[var(--dsw-alias-card-fill)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)]">
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--dsw-alias-card-fill)]"><Icon width={27} height={27} /></span>
        <Tag tone="quiet">{isLoading ? '加载中…' : status}</Tag>
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--dsw-alias-label-primary)]">{name}</span>
        <span className="text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t(description[kind])}</span>
      </span>
      {error
        ? <span role="alert" className="mt-auto text-xs leading-5 text-[var(--dsw-alias-state-error-primary)]">{`渠道列表加载失败：${error.message}`}</span>
        : <span className="mt-auto text-xs text-[var(--dsw-alias-state-business-primary)] underline-offset-4 group-hover:underline">{t(kind === 'feishu' ? 'channelUnsupported' : 'channelConfigure')}</span>}
    </button>
  )
}
