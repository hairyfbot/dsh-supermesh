import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'

/**
 * 校验官方 DSH CLI 入口。
 *
 * Desktop 生成的 `dsh` shim 会无条件把 `DSH_HOME` 写回用户目录，隔离运行经它启动就会
 * 写进真实 `~/.dsh`（issue #69）。所以隔离入口只接受官方 `lib/bin.js` 的绝对路径。
 */
export function officialDshEntry(value: string | undefined, variable: string): string | undefined {
  if (value === undefined || value === '')
    return undefined
  if (!isAbsolute(value) || !value.endsWith('.js') || !existsSync(value))
    throw new Error(`${variable} must be the absolute path to the official @deepseek-ai/dsh lib/bin.js; command shims are not allowed`)
  return value
}
