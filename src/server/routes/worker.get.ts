import { defineHandler } from 'h3'
import { db } from '../../database'

export default defineHandler(async () => {
  const [running, queued] = await Promise.all([db.worker.listRunning(), db.worker.listQueued()])
  return [...new Map([...queued, ...running].map(worker => [worker.id, worker])).values()]
})
