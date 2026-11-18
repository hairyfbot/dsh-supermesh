import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let cached: string | undefined

/**
 * 从当前模块往上找 `package.json` 得到包根目录。
 * 不能写死 `../..`：源码在 `src/ai/_shared/`、打包后在 `dist/`，层级不同。
 * 与官方 `infra/paths.ts` 的 `packageRoot` 同一策略。
 */
function packageRoot(): string {
  if (cached)
    return cached
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      try {
        if ((JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === 'dsh-supermesh')
          return cached = directory
      }
      catch {}
    }
    const parent = dirname(directory)
    if (parent === directory)
      break
    directory = parent
  }
  throw new Error('dsh-supermesh package root not found')
}

function packaged(name: string): string {
  const path = join(packageRoot(), 'assets', 'prompts', `${name}.md`)
  let text: string
  try {
    text = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
  }
  catch (error) {
    throw (error as NodeJS.ErrnoException).code === 'ENOENT' ? new Error(`Missing packaged prompt: ${path}`, { cause: error }) : error
  }
  if (!text.trim())
    throw new Error(`Empty packaged prompt: ${path}`)
  return text
}

const cache = new Map<string, string>()

/**
 * 读 `assets/prompts/<name>.md`，段内换行合并为空格、段间只留单换行。
 * 与官方 `skill-files.ts` 的 `promptFile` 一致：让模型按段落读，不被手写换行干扰。
 */
export function promptFile(name: string): string {
  const hit = cache.get(name)
  if (hit !== undefined)
    return hit
  const paragraphs = packaged(name).trim().split(/\n(?:[ \t]*\n)+/)
  const text = paragraphs.map(paragraph => paragraph.split('\n').map(line => line.trim()).join(' ')).join('\n')
  cache.set(name, text)
  return text
}
