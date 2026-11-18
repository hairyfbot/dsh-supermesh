import type { RoleModel, RoleModels, RoleName } from '../../service/role-model.types'
import { defineHandler, HTTPError, readBody } from 'h3'
import { roleModel } from '../../service/role-model'
import { setting } from '../../service/setting'

interface RoleModelPatch {
  role: RoleName
  provider: string
  model: string
  reasoningEffort?: string
}

const roles: readonly RoleName[] = ['main', 'manager', 'project', 'worker', 'supervisor']

export default defineHandler(async (event): Promise<RoleModels> => {
  const body = await readBody<RoleModelPatch>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['role', 'provider', 'model', 'reasoningEffort'].includes(key))
    || !roles.includes(body.role)
    || typeof body.provider !== 'string' || typeof body.model !== 'string'
    || (body.reasoningEffort !== undefined && typeof body.reasoningEffort !== 'string')) {
    throw new HTTPError({ status: 400, message: 'invalid_agent_model' })
  }
  const provider = body.provider.trim()
  const name = body.model.trim()
  const effort = body.reasoningEffort?.trim() ?? ''
  if ((provider || name || effort) && !(provider && name))
    throw new HTTPError({ status: 400, message: 'invalid_agent_model' })
  const entry: RoleModel | null = provider && name ? { provider, model: name, ...(effort ? { reasoningEffort: effort } : {}) } : null
  if (entry) {
    try {
      await roleModel.resolve(entry)
    }
    catch {
      throw new HTTPError({ status: 400, message: 'unresolved_agent_model' })
    }
  }
  const current = (await setting.load()).models
  const models: RoleModels = { ...current, [body.role]: entry }
  return (await setting.save({ models })).models
})
