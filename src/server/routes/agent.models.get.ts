import type { Context } from '@deepseek-ai/cordis'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller'
import type { RoleModels } from '../../service/role-model.types'
import { getServerContext } from 'dsh-h3/utils'
import { defineHandler } from 'h3'
import { setting } from '../../service/setting'
import { server } from '../index'

export const getAgentModels = defineHandler(async (): Promise<{ models: RoleModels, catalog: ModelCatalog }> => {
  const ctx = getServerContext<Context>(server)
  const [settings, catalog] = await Promise.all([setting.load(), ctx.sessionController.modelCatalog()])
  return { models: settings.models, catalog }
})
