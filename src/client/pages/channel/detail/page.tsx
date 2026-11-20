import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { Case, Switch } from 'react-if-lite'
import { Empty } from '@/client/components/empty'
import { ArrowLeftIcon } from '@/client/components/icons'
import { useActions, useStore } from '@/client/hooks/use-store'
import { useTranslation } from '@/client/hooks/use-translation'
import { FeishuDetail } from '@/client/pages/channel/detail/components/feishu'
import { GithubDetail } from '@/client/pages/channel/detail/components/github'
import { GitlabDetail } from '@/client/pages/channel/detail/components/gitlab'

export function ChannelDetail(): ReactNode {
  const { t } = useTranslation()
  const { go } = useActions()
  const kind = useStore(state => state.channel.selected)
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10">
      <div><Button size="sm" variant="ghost" icon={<ArrowLeftIcon width={16} height={16} />} onClick={() => go('channel')}>{t('channelBack')}</Button></div>
      <Switch value={kind}>
        <Case cond="github"><GithubDetail /></Case>
        <Case cond="gitlab"><GitlabDetail /></Case>
        <Case cond="feishu"><FeishuDetail /></Case>
        <Case cond={null}><Empty compact title={t('channelMissing')} /></Case>
      </Switch>
    </section>
  )
}
