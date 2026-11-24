import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { officialDshEntry } from '../scripts/dsh-entry'

const root = fileURLToPath(new URL('../', import.meta.url))

describe('官方 DSH CLI 入口校验', () => {
  let directory: string
  let cli: string
  let shim: string

  beforeAll(async () => {
    const temporaryRoot = resolve(root, '.temp')
    await mkdir(temporaryRoot, { recursive: true })
    directory = await mkdtemp(join(temporaryRoot, 'dsh-entry-'))
    cli = join(directory, 'bin.js')
    shim = join(directory, 'dsh.cmd')
    await writeFile(cli, '')
    await writeFile(shim, '')
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('没有设置变量时返回 undefined，交给调用方决定是否必需', () => {
    expect(officialDshEntry(undefined, 'DSH_DEV_CLI')).toBeUndefined()
    expect(officialDshEntry('', 'DSH_DEV_CLI')).toBeUndefined()
  })

  it('接受官方 lib/bin.js 的绝对路径', () => {
    expect(officialDshEntry(cli, 'DSH_DEV_CLI')).toBe(cli)
  })

  it('拒绝会改写 DSH_HOME 的 Desktop shim', () => {
    expect(() => officialDshEntry(shim, 'DSH_DEV_CLI')).toThrow('command shims are not allowed')
  })

  it('拒绝相对路径与不存在的入口', () => {
    expect(() => officialDshEntry('bin.js', 'DSH_DEV_CLI')).toThrow('command shims are not allowed')
    expect(() => officialDshEntry(join(directory, 'missing.js'), 'DSH_DEV_CLI')).toThrow('command shims are not allowed')
  })
})
