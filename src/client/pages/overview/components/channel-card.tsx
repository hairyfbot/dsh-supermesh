import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshChannel } from '@/client/apis'
import { Empty } from '@/client/components/empty'
import { ChannelsIcon } from '@/client/components/icons'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'
import { ChannelTile } from '@/client/pages/overview/components/channel-tile'
import { SummaryCard } from '@/client/pages/overview/components/summary-card'

export function ChannelCard({ onMore }: { onMore: () => void }): ReactNode {
  const { t } = useTranslation()
  const { data: channels, isLoading, error } = useQuery({ queryKey: keys.channel, queryFn: () => getApiSupermeshChannel() })
  const items = (channels ?? []).map(channel => ({ kind: channel.kind, name: channel.name, connected: channel.status === 'online' }))
  return (
    <SummaryCard title={t('overviewChannels')} meta={`${items.filter(channel => channel.connected).length}/${items.length}`} icon={<ChannelsIcon width={18} height={18} className="shrink-0" />} actionLabel={t('overviewMoreChannels')} onMore={onMore}>
      {error
        ? <p role="alert" className="mt-auto text-xs leading-5 text-(--dsw-alias-state-error-primary)">{error instanceof Error ? error.message : '渠道列表加载失败'}</p>
        : isLoading
          ? <p role="status" className="mt-auto text-xs leading-5 text-(--dsw-alias-label-tertiary)">加载中…</p>
          : items.length
            ? <div className="mt-auto grid min-h-[83px] grid-cols-3 gap-2.5">{items.slice(0, 3).map(channel => <ChannelTile key={channel.name} channel={channel} />)}</div>
            : <Empty title={t('overviewChannelsEmpty')} description={t('overviewChannelsEmptyDescription')} icon={<ChannelsIcon width={24} height={24} />} />}
      <p className="mt-auto pt-3 text-xs leading-5 text-(--dsw-alias-label-tertiary)">{t('overviewOtherChannel')}</p>
    </SummaryCard>
  )
}
