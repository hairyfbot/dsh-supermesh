import { github } from '../channel/github/channel'
import { gitlab } from '../channel/gitlab/channel'
import { scheduler } from '../runtime/scheduler'
import { defineService } from '../utils/service'
import { channelAuth } from './channel-auth'
import { inbox } from './inbox'
import { project } from './project'
import { session } from './session'
import { worker } from './worker'
import { worktree } from './worktree'

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

async function activate(): Promise<() => Promise<void>> {
  const controller = new AbortController()
  const pending = new Set<Promise<unknown>>()
  const unregister: (() => boolean)[] = []
  const stops: (() => Promise<void>)[] = []
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
    stops.push(() => channelAuth.cleanup())
    stops.push(session.start(), worktree.start(), inbox.start(), worker.start())
    await scheduler.ready()
    await project.sync()
    await worker.recover()
    unregister.push(scheduler.use({ id: 'nexus:runtime', cron: '* * * * * *' }, () => track(async () => {
      await worker.reconcileBackground()
      await inbox.deliverAnswers()
      await inbox.deliver()
      await worker.reconcile()
    })))
    unregister.push(scheduler.use({ id: 'nexus:github', cron: '*/30 * * * * *' }, () => track(async () => {
      const collected = await github.collectAll(controller.signal)
      const flushed = await github.flush(controller.signal)
      const failures = [...collected, ...flushed].filter(result => !result.ok)
      if (failures.length)
        throw new Error(failures.map(result => result.reason ?? 'channel_operation_failed').join(', '))
    })))
    unregister.push(scheduler.use({ id: 'nexus:gitlab', cron: '*/30 * * * * *' }, () => track(async () => {
      const collected = await gitlab.collectAll(controller.signal)
      const flushed = await gitlab.flush(controller.signal)
      const failures = [...collected, ...flushed].filter(result => !result.ok)
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
