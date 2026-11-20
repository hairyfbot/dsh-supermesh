import { defineHandler } from 'h3'
import { db } from '@/database'
import { project } from '@/service/project'
import { session } from '@/service/session'

export default defineHandler(async () => {
  const [projects, runningWorkers, queuedWorkers, messages, mainSessionId] = await Promise.all([
    project.list(),
    db.worker.listRunning(),
    db.worker.listQueued(),
    db.inbox.listRecent(),
    session.findMain(),
  ])
  const bindings = [
    ...(mainSessionId ? [{ sessionId: mainSessionId }] : []),
    ...projects.flatMap(item => item.orchestratorSessionId ? [{ sessionId: item.orchestratorSessionId }] : []),
  ]
  const activities = await Promise.all(bindings.map(async binding => await session.resolve(binding.sessionId) ? await session.activity(binding.sessionId) : { running: false, background: false, queued: false }))
  const failed = messages.find(message => message.status === 'stalled' || (message.status === 'pending' && message.deliveryError))
  const active = activities.some(activity => activity.running || activity.background)
  const queued = queuedWorkers.length > 0 || activities.some(activity => activity.queued)
  return {
    state: failed ? 'delivery_failed' : runningWorkers.length || active ? 'running' : queued ? 'queued' : 'idle',
    reason: failed?.deliveryError ?? null,
  }
})
