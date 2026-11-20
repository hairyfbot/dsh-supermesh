import { github } from '@/channel/github/channel'
import { gitlab } from '@/channel/gitlab/channel'
import { db } from '@/database'
import { scheduler } from '@/runtime/scheduler'
import { archive } from '@/service/archive'
import { devops } from '@/service/devops'
import { inbox } from '@/service/inbox'
import { project } from '@/service/project'
import { session } from '@/service/session'
import { shell } from '@/service/shell'
import { worker } from '@/service/worker'
import { worktree } from '@/service/worktree'
import { defineService } from '@/utils/service'

let starting: Promise<() => Promise<void>> | null = null
let dispose: (() => Promise<void>) | null = null

export const runtime = defineService({
  start(): Promise<() => Promise<void>> {
    if (dispose)
      return Promise.resolve(dispose)
    if (starting)
      return starting
    starting = activate().finally(() => {
      starting = null
    })
    return starting
  },
})

async function closeFinishedSupervisors(): Promise<void> {
  for (const supervisor of await db.supervisor.listActive()) {
    const tickets = await Promise.all((await db.supervisorTicket.listBySupervisor(supervisor.id)).map(link => db.ticket.findById(link.ticketId)))
    if (!tickets.length || tickets.some(ticket => !ticket || (ticket.status !== 'done' && ticket.status !== 'cancelled')))
      continue
    // 手上还有没处理完的消息就先不收：那可能是等待中的协调任务，
    // 直接关掉会让整条跨项目链路静默停在这里。
    const pending = await db.inbox.listPending('supervisor', null)
    if (pending.some(message => message.supervisorId === supervisor.id))
      continue
    await db.supervisor.close(supervisor.id, new Date().toISOString())
    if (supervisor.sessionId) {
      await session.stop(supervisor.sessionId).catch(() => undefined)
      await archive.session(supervisor.sessionId)
    }
  }
}

async function activate(): Promise<() => Promise<void>> {
  const controller = new AbortController()
  const pending = new Set<Promise<unknown>>()
  const unregister: (() => boolean)[] = []
  const stops: (() => Promise<void>)[] = []
  let restoreShell: (() => Promise<void>) | undefined
  let closing: Promise<void> | null = null
  const close = (): Promise<void> => {
    if (closing)
      return closing
    closing = (async () => {
      controller.abort(new Error('runtime_stopped'))
      for (const remove of unregister)
        remove()
      await Promise.allSettled(stops.map(stop => stop()))
      await Promise.allSettled([...pending])
      await restoreShell?.()
      dispose = null
    })()
    return closing
  }
  function track(action: () => Promise<void>): Promise<void> {
    if (controller.signal.aborted)
      return Promise.resolve()
    const task = Promise.resolve().then(action).finally(() => pending.delete(task))
    pending.add(task)
    return task
  }
  try {
    stops.push(() => devops.cleanup())
    stops.push(session.start(), worktree.start(), project.start(), inbox.start(), worker.start())
    await scheduler.ready()
    await session.workspace()
    if (await session.findMain())
      await session.create('main', {})
    await project.sync()
    restoreShell = await shell.start()
    await worker.recover()
    unregister.push(scheduler.use({ id: 'supermesh:runtime', cron: '* * * * * *' }, () => track(async () => {
      await worker.rescue()
      await worker.reconcileBackground()
      await inbox.deliverAnswers()
      await inbox.deliver()
      await worker.reconcile()
      await closeFinishedSupervisors()
    })))
    unregister.push(scheduler.use({ id: 'supermesh:projects', cron: '*/5 * * * * *' }, () => track(async () => {
      await project.sync()
      await shell.refresh()
    })))
    unregister.push(scheduler.use({ id: 'supermesh:github', cron: '*/30 * * * * *' }, () => track(async () => {
      await project.sync()
      const collected = await github.harvest?.(controller.signal) ?? []
      const failures = collected.filter(result => !result.ok)
      if (failures.length)
        throw new Error(failures.map(result => result.reason ?? 'channel_operation_failed').join(', '))
    })))
    // 投递独立于采集：采集要遍历全部历史 PR，耗时可达数分钟；
    // 串在一起会让人的回答和确认排在采集之后，表现为「回复迟迟不出现」。
    unregister.push(scheduler.use({ id: 'supermesh:github:flush', cron: '*/10 * * * * *' }, () => track(async () => {
      const flushed = await github.flush(controller.signal)
      const failures = flushed.filter(result => !result.ok)
      if (failures.length)
        throw new Error(failures.map(result => result.reason ?? 'channel_operation_failed').join(', '))
    })))
    unregister.push(scheduler.use({ id: 'supermesh:gitlab', cron: '*/30 * * * * *' }, () => track(async () => {
      const collected = await gitlab.harvest?.(controller.signal) ?? []
      const failures = collected.filter(result => !result.ok)
      if (failures.length)
        throw new Error(failures.map(result => result.reason ?? 'channel_operation_failed').join(', '))
    })))
    unregister.push(scheduler.use({ id: 'supermesh:gitlab:flush', cron: '*/10 * * * * *' }, () => track(async () => {
      const flushed = await gitlab.flush(controller.signal)
      const failures = flushed.filter(result => !result.ok)
      if (failures.length)
        throw new Error(failures.map(result => result.reason ?? 'channel_operation_failed').join(', '))
    })))
    dispose = close
    return close
  }
  catch (error) {
    await close()
    throw error
  }
}
