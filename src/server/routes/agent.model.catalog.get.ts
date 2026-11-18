import type { Context } from '@deepseek-ai/cordis'
import { getServerContext } from 'dsh-h3/utils'
import { defineHandler } from 'h3'
import { server } from '../index'

export default defineHandler(async () => {
  const ctx = getServerContext<Context>(server)
  return ctx.sessionController.modelCatalog()
})
