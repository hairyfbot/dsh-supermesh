import type { ReactNode } from 'react'
import { useActions } from '@/client/hooks/use-store'
import { ActivityCard } from '@/client/pages/overview/components/activity-card'
import { AskCard } from '@/client/pages/overview/components/ask-card'
import { ChannelCard } from '@/client/pages/overview/components/channel-card'
import { TaskCard } from '@/client/pages/overview/components/task-card'
import { TaskViewCard } from '@/client/pages/overview/components/task-view-card'

export function Overview(): ReactNode {
  const { go: navigate } = useActions()
  return (
    <div className="@container flex flex-col gap-7 pb-10">
      <div className="grid grid-cols-1 gap-4 @min-[800px]:grid-cols-3">
        <ChannelCard onMore={() => navigate('channel')} />
        <ActivityCard onMore={() => navigate('trigger')} />
        <TaskCard onMore={() => navigate('ticket')} />
      </div>
      <AskCard />
      <TaskViewCard />
    </div>
  )
}
