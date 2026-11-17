import type { ReactNode } from 'react'
import { Empty } from '../../components/empty'
import { TasksIcon } from '../../components/icons'
import { useStore } from '../../hooks/use-store'
import { useTranslation } from '../../hooks/use-translation'
import { Row } from './components/row'

export function Ticket(): ReactNode {
  const { t } = useTranslation()
  const tickets = useStore(state => state.data.panel?.tickets ?? [])
  return (
    <section className="@container pb-10">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--dsw-alias-label-secondary)] my-1">{t('ticketListDescription')}</p>
      </div>
      {tickets.length
        ? <ul className="m-0 pl-0">{tickets.map(task => <Row key={task.id} task={task} />)}</ul>
        : <Empty title={t('overviewTasksEmpty')} description={t('overviewTasksEmptyDescription')} icon={<TasksIcon width={24} height={24} />} />}
    </section>
  )
}
