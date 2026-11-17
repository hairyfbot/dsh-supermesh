import type { ReactNode } from 'react'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsyncFn, useAsyncState } from '@reause/core'
import { getApiNexusPanel, getApiNexusSessionsIdContext, getApiNexusTicketsId, postApiNexusTicketsIdAction } from '../../../apis'
import { ActivityIcon, ArrowLeftIcon, ChannelsIcon, GitBranchIcon, NexusIcon } from '../../../components/icons'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { Metric } from './components/metric'
import { Section } from './components/section'

export function TicketDetail(): ReactNode {
  const { t } = useTranslation()
  const { go, openTicket, openThread, receiveTicket, receivePanel } = useActions()
  const { ticketId, returnTo } = useStore(state => state.navigation)
  const detail = useStore(state => state.data.ticket)
  const { isLoading, error } = useAsyncState(async () => {
    if (!ticketId)
      return
    const result = await getApiNexusTicketsId({ id: encodeURIComponent(ticketId) })
    if (!result?.ticket || result.ticket.id !== ticketId)
      throw new Error('任务不存在或无法读取')
    receiveTicket(result)
  }, undefined)
  const [command, submit] = useAsyncFn(async (reason: string) => {
    if (!detail)
      return
    const ticket = await postApiNexusTicketsIdAction({ id: encodeURIComponent(detail.ticket.id), action: detail.ticket.paused ? 'resume' : 'pause' }, { reason })
    if (!ticket || ticket.id !== detail.ticket.id)
      throw new Error('任务操作失败')
    receiveTicket({ ...detail, ticket })
    const panel = await getApiNexusPanel()
    if (panel?.tickets)
      receivePanel(panel)
  })
  const [context, view] = useAsyncFn(async (sessionId: string) => {
    const result = await getApiNexusSessionsIdContext({ id: encodeURIComponent(sessionId) })
    if (!result || result.sessionId !== sessionId)
      throw new Error('会话上下文读取失败')
    return result.text
  })
  const task = detail?.ticket
  const latest = detail?.executions.at(-1)
  return (
    <section className="@container flex min-w-0 flex-col gap-5 pb-10" aria-label={t('ticketDetail')}>
      <div><Button variant="ghost" size="sm" icon={<ArrowLeftIcon width={16} height={16} />} onClick={() => go(returnTo)}>{t('ticketBack')}</Button></div>
      {isLoading && <p role="status">加载中…</p>}
      {Boolean(error) && <p role="alert">{error instanceof Error ? error.message : '读取失败'}</p>}
      {task && detail && (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Tag tone="quiet">{task.paused ? '已暂停' : task.status}</Tag>
              <span className="ml-3 text-xs">{task.id}</span>
              <h2 className="mt-3 text-lg font-medium">{task.title}</h2>
            </div>
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void submit(String(new FormData(event.currentTarget).get('reason') ?? ''))
              }}
            >
              <Input name="reason" required placeholder="操作原因" aria-label="操作原因" />
              <Button type="submit" size="sm" variant="outline" disabled={command.loading || task.status === 'done' || task.status === 'cancelled'}>{task.paused ? '恢复' : '暂停'}</Button>
            </form>
          </header>
          {command.error && <p role="alert">{command.error.message}</p>}
          <dl className="m-0 grid min-w-0 gap-3 @min-[460px]:grid-cols-2 @min-[820px]:grid-cols-4">
            <Metric label={t('ticketProject')} icon={<NexusIcon width={17} height={17} />}>{detail.project?.name ?? task.projectId}</Metric>
            <Metric label={t('ticketChannel')} icon={<ChannelsIcon width={17} height={17} />}>{task.channelId}</Metric>
            <Metric label="最后更新" icon={<ActivityIcon width={17} height={17} />}>{new Date(task.updatedAt).toLocaleString()}</Metric>
            <Metric label={t('ticketExecutionBranch')} icon={<GitBranchIcon width={17} height={17} />}>{latest?.branch ?? '尚未创建'}</Metric>
          </dl>
          {task.prepareError && <p role="alert">{task.prepareError}</p>}
          <Section title="任务描述">
            <p className="m-0 whitespace-pre-wrap">{task.description ?? '暂无描述'}</p>
            {task.prUrl && (
              <span className="break-all">
                {task.prUrl}
                {' '}
                ·
                {' '}
                {task.prState}
                {' '}
                ·
                {' '}
                {task.ciState}
              </span>
            )}
          </Section>
          <Section title="执行记录">
            <ul className="m-0 list-none p-0">
              {detail.executions.map(worker => (
                <li key={worker.id} className="mb-3 flex flex-wrap items-center gap-2">
                  <span>
                    {worker.id}
                    {' '}
                    ·
                    {' '}
                    {worker.status}
                  </span>
                  <span>{worker.report}</span>
                  <Button size="sm" variant="outline" disabled={context.loading} onClick={() => void view(worker.id)}>查看上下文</Button>
                </li>
              ))}
            </ul>
            {context.error && <p role="alert">{context.error.message}</p>}
            {context.value && <pre className="max-h-80 overflow-auto whitespace-pre-wrap">{context.value}</pre>}
          </Section>
          <Section title="关联任务">
            <div className="flex flex-wrap gap-2">
              {detail.dependencies.map((link) => {
                const id = link.ticketId === task.id ? link.relatedId : link.ticketId
                return (
                  <Button key={link.ticketId + link.relatedId + link.kind} size="sm" variant="outline" onClick={() => openTicket(id)}>
                    {link.kind}
                    {' '}
                    ·
                    {' '}
                    {id}
                  </Button>
                )
              })}
            </div>
          </Section>
          <Section title="来源话题"><ul className="m-0 list-none p-0">{detail.topics.map(topic => <li key={topic.id}><Button size="sm" variant="ghost" onClick={() => openThread(topic.id)}>{topic.title}</Button></li>)}</ul></Section>
          <Section title="收件箱记录">
            <ul className="m-0 list-none p-0">
              {detail.inbox.map(message => (
                <li key={message.id} className="mb-3 whitespace-pre-wrap">
                  {message.status}
                  {' '}
                  ·
                  {' '}
                  {message.message}
                  {message.answer ? ` → ${message.answer}` : ''}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </section>
  )
}
