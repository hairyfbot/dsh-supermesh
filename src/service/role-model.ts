import type { Context } from '@deepseek-ai/cordis'
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent'
import type { } from '@deepseek-ai/dsh-session-persistence'
import type { RoleModel } from './role-model.types'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { getServerContext } from 'dsh-h3/utils'
import { server } from '../server'
import { defineService } from '../utils/service'

export const roleModel = defineService({
  async resolve(model: RoleModel): Promise<ModelSelection> {
    const ctx = getServerContext<Context>(server)
    const value = await ctx.llm.resolveCallConfig({
      provider: model.provider,
      model: model.model,
      ...(model.reasoningEffort ? { reasoningEffort: ReasoningEffortId(model.reasoningEffort) } : {}),
    })
    return { provider: value.provider, model: value.model, ...(value.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}) }
  },
  async initialize(agent: Agent, model: RoleModel | null): Promise<void> {
    if (!model)
      return
    if (agent.session.requestHeader() || agent.session.snapshotEvents().some(event => event.type === 'model/selection'))
      return
    const ctx = getServerContext<Context>(server)
    const selected = await roleModel.resolve(model)
    agent.session.append('model/selection', selected)
    let initial = true
    let assembled: ModelSelection | undefined
    agent.ctx.effect(() => {
      const disposers = [
        agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
          const selection = initial ? selected : undefined
          const result = await next()
          assembled = selection
          return selection ? { ...result, variables: { ...result.variables, provider: selection.provider, model: selection.model } } : result
        }, { prepend: true }),
        agent.ctx.on('agent/request', async (_payload, next) => {
          const result = await next()
          if (!assembled)
            return result
          const { reasoningEffort: _inherited, ...rest } = result
          return { ...rest, ...assembled }
        }, { prepend: true }),
        ctx.on('session/event', (session, event) => {
          if (session === agent.session && (event.type === 'request/header' || event.type === 'model/selection'))
            initial = false
        }),
      ]
      return () => disposers.forEach(dispose => dispose())
    })
    await ctx.sessionPersistence.flush()
  },
})
