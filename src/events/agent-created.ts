import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AgentPreset } from '@/ai/preset'
import { agents } from '@/ai'
import { inbox } from '@/service/inbox'
import { session } from '@/service/session'

export async function handleAgentCreated(ctx: Context, agent: Agent): Promise<undefined> {
  const id = ctx.agentPresets.composedPreset(agent.ctx)
  const definition = agents[id as keyof typeof agents] as AgentPreset | undefined
  if (definition?.tools.length) {
    ctx.effect(() => agent.ctx.effect(() => {
      const disposers = definition.tools.map(tool => agent.ctx.tools.register(tool))
      return () => disposers.forEach(dispose => dispose())
    }, 'supermesh:tools'), 'supermesh:agent-tools')
  }
  const role = await session.attach(agent)
  if (!role)
    return
  if (role === 'worker')
    return
  ctx.effect(() => agent.ctx.on('agent/status', ({ status }) => {
    if (status === 'idle')
      void inbox.notify(agent).catch(error => ctx.logger.error(error))
  }), 'supermesh:mailbox-notice')
  await inbox.notify(agent)
}
