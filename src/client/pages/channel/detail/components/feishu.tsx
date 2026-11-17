import type { ReactNode } from 'react'
import { Empty } from '../../../../components/empty'
import { FeishuIcon } from '../../../../components/icons'
import { useStore } from '../../../../hooks/use-store'
import { useTranslation } from '../../../../hooks/use-translation'
import { DetailHeader } from './header'

export function FeishuDetail(): ReactNode {
  const { t } = useTranslation()
  const name = useStore(state => state.data.panel?.channels.find(channel => channel.id === 'feishu')?.name)
  return (
    <>
      <DetailHeader name={name ?? '飞书'} icon={<FeishuIcon width={27} height={27} />} supported={false} />
      <Empty compact title={t('channelUnsupported')} description={t('channelFeishuUnavailable')} className="rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)] p-6" />
    </>
  )
}
