import type { Buffer } from 'node:buffer'
import type { Page } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { x } from 'tinyexec'
import { dshCommand, exchangeProcessLaunchToken, freePort, stop, trustedProcessLaunchUrl } from './shell.utils'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

export interface ShellScaffold {
  baseUrl: string
  home: string
  cookie: Awaited<ReturnType<typeof exchangeProcessLaunchToken>>
  close: () => Promise<void>
}

export function logs(page: Page): { errors: () => string[] } {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error')
      errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(String(error)))
  return { errors: () => [...errors] }
}

export async function launchShell(): Promise<ShellScaffold> {
  const cli = dshCommand()
  const temp = resolve(REPO_ROOT, '.temp')
  await mkdir(temp, { recursive: true })
  const home = await mkdtemp(join(temp, 'dsh-e2e-'))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_HOME: home,
    DSH_AGENTS_HOME: join(home, 'agents'),
    DSH_TELEMETRY_DISABLED: '1',
    npm_config_ignore_scripts: 'true',
    CI: 'true',
  }
  for (const key of Object.keys(env)) {
    if (key.startsWith('DSH_') && !['DSH_HOME', 'DSH_AGENTS_HOME', 'DSH_TELEMETRY_DISABLED'].includes(key))
      delete env[key]
  }
  const node = process.env.DSH_E2E_NODE ?? process.execPath
  const run = (args: string[]) => x(node, [cli, ...args], {
    timeout: 180_000,
    throwOnError: true,
    nodeOptions: { cwd: home, env, windowsHide: true },
  })
  let child: ReturnType<typeof x>['process']
  try {
    await run(['--profile', 'supermesh-e2e', '--from-default-profile', 'web', '--dump-config'])
    // 官方 CLI 一定把 profile 建在 DSH_HOME 下；这里没有就是被 shim 之类的入口改写了 DSH_HOME。
    if (!existsSync(join(home, 'profiles', 'supermesh-e2e', 'package.json')))
      throw new Error(`the launched DSH did not honour the isolated DSH_HOME: ${join(home, 'profiles', 'supermesh-e2e')} was not created`)
    await run(['plugin', '--profile', 'supermesh-e2e', 'add', '--ignore-scripts', `link:${REPO_ROOT.replace(/\\/gu, '/')}`])
    const patch = join(home, 'test.cordis.patch.yml')
    await writeFile(patch, '- id: ui-settings-models\n  config:\n    credentialOnboarding: false\n')
    const port = await freePort()
    const baseUrl = `http://127.0.0.1:${port}`
    const result = x(node, [cli, '--profile', 'supermesh-e2e', '--patch', patch, '--port', String(port), '--no-open'], {
      nodeOptions: { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    })
    child = result.process
    if (!child)
      throw new Error('failed to start isolated DSH CLI')
    const owned = child
    const launchUrl = await new Promise<string>((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error('isolated DSH startup timed out')), 120_000)
      const exit = () => {
        clearTimeout(timer)
        reject(new Error(`DSH exited: ${output.replace(/token=\S+/gu, 'token=[redacted]')}`))
      }
      owned.once('exit', exit)
      owned.once('error', reject)
      for (const stream of [owned.stdout, owned.stderr]) {
        stream?.on('data', (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-16_384)
          for (const line of output.split(/\r?\n/u)) {
            const match = /^dsh web:\s+(https?:\/\/\S+)\s*$/u.exec(line)
            if (match && trustedProcessLaunchUrl(baseUrl, match[1]!) !== null) {
              clearTimeout(timer)
              owned.off('exit', exit)
              resolve(match[1]!)
            }
          }
        })
      }
    })
    const cookie = await exchangeProcessLaunchToken(baseUrl, launchUrl)
    let closed = false
    return {
      baseUrl,
      home,
      cookie,
      close: async () => {
        if (closed)
          return
        closed = true
        await stop(child!)
        await rm(home, { recursive: true, force: true })
      },
    }
  }
  catch (error) {
    if (child)
      await stop(child)
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
