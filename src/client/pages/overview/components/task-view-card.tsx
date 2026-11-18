import type { SegmentedTab } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { OverviewView } from '../../../types'
import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import { useId } from 'react'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { Graph } from './graph'
import { StatusTag } from './status-tag'
import { TaskList } from './task-list'

export function TaskViewCard(): ReactNode {
  const { t } = useTranslation()
  const { setOverviewView } = useActions()
  const view = useStore(state => state.overview.view)
  const id = useId().replaceAll(':', '')
  const tabs: [SegmentedTab<OverviewView>, SegmentedTab<OverviewView>] = [
    { value: 'recent', label: t('overviewRecent'), id: `${id}-recent`, panelId: `${id}-recent-panel` },
    { value: 'hierarchy', label: t('overviewHierarchy'), id: `${id}-hierarchy`, panelId: `${id}-hierarchy-panel` },
  ]
  return (
    <section aria-label={t('overviewTaskViews')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs size="sm" value={view} onChange={setOverviewView} items={tabs} label={t('overviewTaskViews')} />
        <StatusTag />
      </div>
      <div id={`${id}-${view}-panel`} role="tabpanel" aria-labelledby={`${id}-${view}`} tabIndex={0} className="rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dsw-alias-state-business-primary)">
        {view === 'recent' ? <TaskList /> : <Graph />}
      </div>
    </section>
  )
}
