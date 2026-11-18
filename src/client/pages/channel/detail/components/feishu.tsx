import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshChannel } from '../../../../apis'
import { Empty } from '../../../../components/empty'
import { FeishuIcon } from '../../../../components/icons'
import { keys } from '../../../../config/query-keys'
import { useTranslation } from '../../../../hooks/use-translation'
import { DetailHeader } from './header'

export function FeishuDetail(): ReactNode {
  const { t } = useTranslation()
  const { data: channels, error } = useQuery({
    queryKey: keys.channel,
    queryFn: () => getApiSupermeshChannel(),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
  const name = channels?.find(channel => channel.id === 'feishu')?.name
  return (
    <>
      <DetailHeader name={name ?? '飞书'} icon={<FeishuIcon width={27} height={27} />} supported={false} />
      {error && <p role="alert" className="m-0 text-xs leading-5 text-(--dsw-alias-state-error-primary)">{`渠道列表加载失败：${error.message}`}</p>}
      <Empty compact title={t('channelUnsupported')} description={t('channelFeishuUnavailable')} className="rounded-2xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1) p-6" />
    </>
  )
}
