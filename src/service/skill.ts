import type { Context } from '@deepseek-ai/cordis'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineService } from '../utils/service'

export const skill = defineService({
  roots(): string[] {
    return [join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'skills')].filter(path => existsSync(path))
  },
  async install(ctx: Context): Promise<() => void> {
    const roots = skill.roots()
    if (!roots.length)
      return () => undefined
    const fiber = ctx.plugin(await import('@deepseek-ai/dsh-skill-filesystem'), { customSkillDirs: roots })
    return () => void fiber.dispose()
  },
})
