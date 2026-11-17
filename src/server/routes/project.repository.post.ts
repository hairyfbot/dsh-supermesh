import { defineHandler, HTTPError, readBody } from 'h3'
import { project } from '../../service/project'

export const postRepository = defineHandler(async (event) => {
  const body = await readBody<{ remoteUrl: string, name?: string }>(event)
  if (!body || typeof body.remoteUrl !== 'string' || (body.name !== undefined && typeof body.name !== 'string'))
    throw new HTTPError({ status: 400, message: 'invalid_repository_request' })
  try {
    return await project.addRepository(body.remoteUrl, body.name, event.req.signal)
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : ''
    const invalid = ['invalid_repository_remote', 'invalid_workspace_name'].includes(reason)
    const conflict = ['repository_path_conflict', 'repository_remote_mismatch'].includes(reason)
    const cancelled = reason === 'repository_clone_cancelled'
    const message = invalid || conflict || cancelled || ['repository_clone_timeout', 'repository_clone_failed', 'repository_registration_failed'].includes(reason) ? reason : 'repository_registration_failed'
    throw new HTTPError({ status: invalid ? 400 : conflict ? 409 : cancelled ? 408 : message === 'repository_clone_timeout' ? 504 : 502, message })
  }
})
