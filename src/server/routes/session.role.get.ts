import { defineHandler } from 'h3'
import { db } from '../../database'
import { storage } from '../../storage'

export default defineHandler(async () => {
  const [mainSessionId, projects, supervisors, workers] = await Promise.all([
    storage.getItem<string>('orchestrator.id'),
    db.project.listAll(),
    db.supervisor.listByStatus('active'),
    db.worker.listRecent(),
  ])
  return {
    sessions: [
      ...(mainSessionId ? [{ sessionId: mainSessionId, role: 'main' as const }] : []),
      ...projects.flatMap(project => project.orchestratorSessionId ? [{ sessionId: project.orchestratorSessionId, role: 'project' as const }] : []),
      ...supervisors.flatMap(supervisor => supervisor.sessionId ? [{ sessionId: supervisor.sessionId, role: 'supervisor' as const }] : []),
      ...workers.map(worker => ({ sessionId: worker.id, role: 'worker' as const })),
    ],
  }
})
