import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixture = fileURLToPath(new URL('./fixtures/setting-storage.mjs', import.meta.url))

describe('全局管理员设置的真实文件存储', () => {
  it('兼容旧设置、独立持久化归一名单并保持空名单与订阅准入边界', async () => {
    const temporaryRoot = resolve(root, '.temp')
    await mkdir(temporaryRoot, { recursive: true })
    const directory = await mkdtemp(join(temporaryRoot, 'setting-storage-'))
    if (!resolve(directory).startsWith(`${temporaryRoot}\\`) && !resolve(directory).startsWith(`${temporaryRoot}/`))
      throw new Error(`Refusing cleanup outside owned .temp directory: ${directory}`)
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [fixture], {
          cwd: directory,
          env: { ...process.env, DSH_HOME: join(directory, 'home') },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15000,
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
            reject(new Error(`Settings storage failed (exit=${code}, signal=${signal}):\n${output}`))
          else
            resolve(output)
        })
      })
      expect(output).toContain('SETTING_STORAGE_PASS')
    }
    finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 20000)
})
