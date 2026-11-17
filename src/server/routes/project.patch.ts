import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { db } from '../../database'

interface ProjectPatch {
  enabled: boolean
}

export const patchProject = defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  const body = await readBody<ProjectPatch>(event)
  if (!id?.trim() || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'enabled') || typeof body.enabled !== 'boolean')
    throw new HTTPError({ status: 400, message: 'invalid_enabled' })
  const current = await db.project.findById(id)
  if (!current)
    throw new HTTPError({ status: 404, message: 'not_found' })
  if (body.enabled && !current.remoteUrl?.trim())
    throw new HTTPError({ status: 409, message: 'repository_identity_unverified' })
  const project = await db.project.setEnabled(id, body.enabled, new Date().toISOString())
  if (!project)
    throw new HTTPError({ status: 409, message: 'project_unavailable' })
  return project
})
