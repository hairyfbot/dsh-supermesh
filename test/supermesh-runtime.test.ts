import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixture = fileURLToPath(new URL('./fixtures/supermesh-runtime.mjs', import.meta.url))

async function runCase(name: string): Promise<string> {
  const cli = process.env.DSH_E2E_CLI
  const installation = process.env.DSH_INSTALL_DIR ?? (cli ? dirname(dirname(resolve(cli))) : undefined)
  const executable = process.env.DSH_NODE_EXECUTABLE ?? (cli ? process.execPath : undefined)
  if (!executable || !installation)
    throw new Error('Real official runtime requires DSH_NODE_EXECUTABLE/DSH_INSTALL_DIR or DSH_E2E_CLI; no mock or local dependency fallback is permitted')
  const temporaryRoot = resolve(root, '.temp')
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(join(temporaryRoot, 'supermesh-runtime-'))
  if (!resolve(directory).startsWith(`${temporaryRoot}\\`) && !resolve(directory).startsWith(`${temporaryRoot}/`))
    throw new Error(`Refusing cleanup outside owned .temp directory: ${directory}`)
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(executable, [fixture, name], {
        cwd: directory,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|PASSWORD|SECRET|TOKEN/i.test(key) && !key.toUpperCase().startsWith('GIT_') && key.toUpperCase() !== 'PATH')),
          PATH: [process.env.SUPERMESH_TEST_GLAB_DIR, ...(process.env.PATH ?? '').split(delimiter).filter(path => !/[\\/]\.supermesh[\\/]cli[\\/]bin[\\/]?$/i.test(path) && !/[\\/]worker-bin[\\/]?$/i.test(path))].filter(Boolean).join(delimiter),
          ELECTRON_RUN_AS_NODE: '1',
          DSH_INSTALL_DIR: installation,
          DSH_HOME: join(directory, 'home'),
          HOME: join(directory, 'home'),
          USERPROFILE: join(directory, 'home'),
          XDG_CONFIG_HOME: join(directory, 'home', '.config'),
          GH_CONFIG_DIR: join(directory, 'home', 'ambient-gh'),
          GLAB_CONFIG_DIR: join(directory, 'home', 'ambient-glab'),
          GH_TOKEN: '',
          GITHUB_TOKEN: '',
          GH_ENTERPRISE_TOKEN: '',
          GITHUB_ENTERPRISE_TOKEN: '',
          GITLAB_TOKEN: '',
          GLAB_TOKEN: '',
          GIT_CONFIG_GLOBAL: join(directory, 'home', 'ambient-gitconfig'),
          GIT_CONFIG_NOSYSTEM: '1',
          SUPERMESH_TEST_CWD: directory,
        },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
      })
      let output = ''
      child.stdout.setEncoding('utf8').on('data', (data: string) => {
        output += data
      })
      child.stderr.setEncoding('utf8').on('data', (data: string) => {
        output += data
      })
      child.on('error', reject)
      child.on('close', (code, signal) => {
        if (code !== 0)
          reject(new Error(`Real runtime case ${name} failed (exit=${code}, signal=${signal}):\n${output}`))
        else
          resolve(output)
      })
    })
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('supermesh services composed with the installed official runtime', () => {
  it.each([
    ['shell', 'native CLI shims use isolated bot credentials and git identities, reject other hosts and restore the process environment'],
    ['projectSync', 'official workspace changes discover and disable repositories while preserving history and explicit choices'],
    ['workspace', 'non-worker sessions share and persist one official workspace and reuse role bindings'],
    ['createMail', 'internal mail creates and wakes main, project and supervisor with mail counts'],
    ['resumeMail', 'internal mail resumes cold role sessions without replacing their bindings'],
    ['invalidMail', 'disabled projects are skipped and an invalid mail does not prevent valid delivery'],
    ['channelIsolation', 'a stalled channel mail does not block internal mail for the same recipient'],
    ['workerEnd', 'a ticket that reached a terminal state ends the worker that was still running'],
    ['workerSettlement', 'a finished worker wakes the project orchestrator with the official settlement notice'],
    ['roleMarker', 'only the four role sessions receive the bot identity marker'],
    ['sendDelivery', 'running sessions steer at the next step while idle sessions and explicit queues open a new turn'],
  ])('%s: %s', async (name) => {
    const output = await runCase(name)
    expect(output).toContain(`SUPERMESH_RUNTIME_PASS ${name} DSH=`)
    if (name === 'shell' && process.env.SUPERMESH_TEST_GLAB_DIR)
      expect(output).toContain('SUPERMESH_GLAB_REAL_PASS')
  }, 70000)
})
