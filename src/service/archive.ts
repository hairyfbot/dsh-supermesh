import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { getServerContext } from 'dsh-h3/utils'
import { server } from '../server'
import { defineService } from '../utils/service'
import { session } from './session'
import { setting } from './setting'

export const archive = defineService({
  async session(id: string): Promise<boolean> {
    const settings = await setting.load()
    if (!settings.autoArchiveWorkers)
      return false
    const ctx = getServerContext<Context>(server)
    await session.stop(id).catch(() => undefined)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await ctx.workspaceRegistry.archiveSession(id as SessionId, { stopActivity: true })
        return true
      }
      catch (error) {
        if (attempt === 2) {
          ctx.logger.warn('nexus: archiving session %s failed: %s', id, error instanceof Error ? error.message : String(error))
          return false
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    return false
  },
})
