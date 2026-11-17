import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { worktree } from '../src/service/worktree'

const mocks = vi.hoisted(() => ({ git: vi.fn(), lstat: vi.fn(), mkdir: vi.fn(), realpath: vi.fn() }))
vi.mock('node:util', () => ({ promisify: () => mocks.git }))
vi.mock('node:fs/promises', () => ({ lstat: mocks.lstat, mkdir: mocks.mkdir, realpath: mocks.realpath }))

const root = resolve('isolated-repository')
const target = resolve('isolated-worktree')

let stopService: () => Promise<void>
beforeEach(() => {
  vi.resetAllMocks()
  stopService = worktree.start()
  mocks.realpath.mockImplementation(async (path: string) => path)
  mocks.git.mockImplementation(async (_command: string, args: string[], options: { cwd: string }) => {
    let stdout = ''
    if (args[0] === 'worktree')
      stdout = [`worktree ${target}`, 'branch refs/heads/nexus/T1', '', ''].join(String.fromCharCode(0))
    else if (args[0] === 'branch')
      stdout = 'nexus/T1'
    else if (args[0] === 'rev-parse')
      stdout = resolve(root, '.git')
    return { stdout, stderr: '', cwd: options.cwd }
  })
})
afterEach(async () => {
  await stopService()
  vi.restoreAllMocks()
})

describe('工作树复用边界', () => {
  it('已登记且共享同一git目录的分支才允许复用', async () => {
    await expect(worktree.verify(root, target, 'nexus/T1')).resolves.toBeUndefined()
    expect(mocks.git).toHaveBeenCalledWith('git', ['worktree', 'list', '--porcelain', '-z'], expect.objectContaining({ cwd: root }))
  })
  it('外部git目录不能冒充当前仓库的工作树', async () => {
    mocks.git.mockImplementation(async (_command: string, args: string[], options: { cwd: string }) => ({ stdout: args[0] === 'worktree' ? [`worktree ${target}`, '', ''].join(String.fromCharCode(0)) : args[0] === 'branch' ? 'nexus/T1' : resolve(options.cwd, '.git') }))
    await expect(worktree.verify(root, target, 'nexus/T1')).rejects.toThrow('worktree_branch_conflict')
  })
  it('分支末段不匹配工单时不执行git也不创建目录', async () => {
    await expect(worktree.create(root, 'T1', 'nexus/T2')).rejects.toThrow('branch_ticket_mismatch')
    expect(mocks.git).not.toHaveBeenCalled()
    expect(mocks.mkdir).not.toHaveBeenCalled()
  })
  it('符号链接指向其他路径时拒绝复用', async () => {
    mocks.realpath.mockImplementation(async (path: string) => path === target ? resolve('other-worktree') : path)
    await expect(worktree.verify(root, target, 'nexus/T1')).rejects.toThrow('worktree_path_conflict')
  })
})
