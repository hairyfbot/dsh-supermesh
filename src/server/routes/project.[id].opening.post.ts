import { defineHandler, getRouterParam, HTTPError } from 'h3'
import { project } from '../../service/project'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  if (!id?.trim())
    throw new HTTPError({ status: 400, message: 'project_id_required' })
  try {
    return await project.open(id, event.req.signal)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'repository_open_failed'
    throw new HTTPError({ status: message === 'project_not_found' ? 404 : message === 'native_open_unavailable' ? 503 : 502, message })
  }
})
