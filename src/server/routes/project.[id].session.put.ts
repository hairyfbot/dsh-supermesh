import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { session } from '@/service/session'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id?.trim())
    throw new HTTPError({ status: 400, message: 'project_id_required' })
  try {
    return { sessionId: await session.create('project', { projectId: id }) }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'session_open_failed'
    throw new HTTPError({ status: message === 'project_not_found' ? 404 : message === 'session_binding_conflict' ? 409 : message === 'runtime_stopping' ? 503 : 502, message })
  }
})
