import { defineHandler } from 'h3'
import { project } from '../../service/project'
import { session } from '../../service/session'

export default defineHandler(async () => {
  const projects = await project.list()
  return Promise.all(projects.map(async (item) => {
    const id = item.orchestratorSessionId ?? null
    let status: 'not_created' | 'running' | 'background' | 'queued' | 'idle' = 'not_created'
    let sessionId: string | null = null
    if (id) {
      const identity = await session.resolve(id)
      if (identity?.role === 'project' && identity.projectId === item.id) {
        const activity = await session.activity(id)
        status = activity.running ? 'running' : activity.background ? 'background' : activity.queued ? 'queued' : 'idle'
        sessionId = id
      }
    }
    return { ...item, session: { sessionId, status } }
  }))
})
