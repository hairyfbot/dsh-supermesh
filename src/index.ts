import type { Context } from '@deepseek-ai/cordis'
import type { } from '@deepseek-ai/dsh-agent-preset-registry'
import type { } from '@deepseek-ai/dsh-api-session-controller'
import type { } from '@deepseek-ai/dsh-client-connection'
import type { } from '@deepseek-ai/dsh-credentials'
import type { } from '@deepseek-ai/dsh-session'
import type { } from '@deepseek-ai/dsh-session-query'
import type { } from '@deepseek-ai/dsh-workspace'

import { agents } from './ai'
import { handleAgentCreated } from './events/agent-created'
import { handleSessionEvent } from './events/session-event'
import { server } from './server'
import { runtime } from './service/runtime'
import { session } from './service/session'
import { skill } from './service/skill'

export const inject = ['agents', 'agentPresets', 'sessionController', 'workspaceRegistry', 'sessionQuery', 'credentials', 'connection', 'webServer', 'worktrees']

export async function apply(ctx: Context): Promise<void> {
  await ctx.effect(async function* () {
    for (const definition of Object.values(agents)) {
      yield await ctx.agentPresets.register(definition.preset)
      yield session.register(definition.preset.id)
    }
  }, 'nexus:presets')

  ctx.on('agent/created', ({ agent }) => handleAgentCreated(ctx, agent))

  ctx.on('session/event', handleSessionEvent)

  await ctx.effect(() => server(ctx, {
    origin: ctx.webServer.getOrigin(),
    owner: (event) => {
      const admission = ctx.connection.admit({ headers: event.req.headers })
      return !('rejection' in admission) && admission.peer.principal.kind === 'owner'
    },
  }), 'nexus:routes')

  await ctx.effect(() => runtime.start(), 'nexus:runtime')
  await ctx.effect(() => skill.install(ctx), 'nexus:skills')
}
