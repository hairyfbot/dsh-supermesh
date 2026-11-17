import type { ReactNode } from 'react'
import type { GetApiNexusPanelResponse } from '../../../apis/index.type'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { TasksIcon } from '../../../components/icons'
import { useActions } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function Row({ task }: { task: GetApiNexusPanelResponse['tickets'][number] }): ReactNode {
  const { t } = useTranslation()
  const { openTicket } = useActions()
  const labels = { waiting: '等待中', queued: '排队中', running: '执行中', review: '待审阅', done: '已完成', cancelled: '已取消' }
  return (
    <li className="flex flex-col gap-3 border-b border-[var(--dsw-alias-border-l3)] py-5 last:border-b-0 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between @min-[640px]:gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-[var(--dsw-alias-label-tertiary)]"><TasksIcon width={17} height={17} /></span>
        <div className="min-w-0">
          <h3 className="text-[13px] leading-5 font-medium [overflow-wrap:anywhere] m-0">
            <span className="mr-2 text-xs font-normal text-[var(--dsw-alias-label-tertiary)]">{task.id}</span>
            {task.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">
            <Tag tone={task.prepareError ? 'danger' : task.status === 'done' ? 'success' : 'quiet'}>{task.paused ? '已暂停' : labels[task.status]}</Tag>
            <span>{task.channelId}</span>
            <time dateTime={task.updatedAt}>{new Date(task.updatedAt).toLocaleString()}</time>
            {task.prepareError && <span>{task.prepareError}</span>}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[29px] @min-[640px]:pl-0">
        <Button size="sm" variant="primary" onClick={() => openTicket(task.id)}>{t('overviewOpenDetails')}</Button>
      </div>
    </li>
  )
}
