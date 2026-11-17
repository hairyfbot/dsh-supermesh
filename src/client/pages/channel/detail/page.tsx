import type { ReactNode } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { ArrowLeftIcon, ChannelsIcon, FeishuIcon, GitHubIcon, GitLabIcon } from '../../../components/icons'
import { OVERVIEW_CHANNEL_LABELS } from '../../../constants'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { Configuration } from './components/configuration'
import { Section } from './components/section'

export function ChannelDetail(): ReactNode {
  const { t } = useTranslation()
  const { go } = useActions()
  const kind = useStore(state => state.channel.selected)
  const channel = useStore(state => state.data.panel?.channels.find(channel => channel.id === kind))
  const Icon = kind ? { github: GitHubIcon, gitlab: GitLabIcon, feishu: FeishuIcon }[kind] ?? ChannelsIcon : null
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10">
      <div><Button size="sm" variant="ghost" icon={<ArrowLeftIcon width={16} height={16} />} onClick={() => go('channel')}>{t('channelBack')}</Button></div>
      {!kind || !Icon || !channel
        ? <p className="text-sm text-[var(--dsw-alias-label-secondary)]">{t('channelMissing')}</p>
        : (
            <>
              <header className="flex flex-wrap items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-[var(--dsw-alias-card-fill)]"><Icon width={27} height={27} /></span>
                <div className="flex flex-col gap-1">
                  <h2 className="m-0 text-base font-medium">{channel.name ?? OVERVIEW_CHANNEL_LABELS[kind]}</h2>
                  <p className="m-0 text-xs text-[var(--dsw-alias-label-secondary)]">{t('channelSettings')}</p>
                </div>
                <Tag tone={channel.enabled ? 'info' : 'quiet'}>{channel.enabled ? '已开启' : '已关闭'}</Tag>
              </header>
              <Section title="当前账户">
                <ul className="m-0 list-none p-0">
                  {channel.accounts.map(account => (
                    <li key={account.id} className="py-2">
                      {account.name}
                      {' '}
                      ·
                      {' '}
                      {account.role}
                      {' '}
                      ·
                      {' '}
                      {account.status}
                    </li>
                  ))}
                </ul>
                {channel.host && <p>{channel.host}</p>}
              </Section>
              {kind !== 'github' && kind !== 'gitlab'
                ? (
                    <div className="rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-6">
                      <h3 className="m-0 text-sm font-medium">{t('channelUnsupported')}</h3>
                      <p className="mb-0 mt-2 text-[13px] leading-5 text-[var(--dsw-alias-label-secondary)]">{t('channelFeishuUnavailable')}</p>
                    </div>
                  )
                : (
                    <>
                      <p className="m-0 rounded-xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-card-fill)] px-4 py-3 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('channelUnavailable')}</p>
                      <p className="m-0 text-xs text-[var(--dsw-alias-label-secondary)]">{t('channelSingleAccount')}</p>
                      <Configuration key={kind} kind={kind} />
                    </>
                  )}
            </>
          )}
    </section>
  )
}
