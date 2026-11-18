import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { worktree } from '../src/service/worktree'

const execute = promisify(execFile)
const root = resolve('.temp')
let directory: string
let stop: () => Promise<void>

beforeEach(async () => {
  await mkdir(root, { recursive: true })
  directory = await mkdtemp(join(root, 'repository-git-'))
  stop = worktree.start()
})

afterEach(async () => {
  await stop()
  if (!directory.startsWith(`${root}\\`) && !directory.startsWith(`${root}/`))
    throw new Error('Refusing cleanup outside owned test directory')
  await rm(directory, { force: true, recursive: true })
})

async function repository(name: string, remote: string) {
  const target = join(directory, name)
  await mkdir(target)
  await execute('git', ['init', target], { timeout: 10000 })
  await execute('git', ['-C', target, 'remote', 'add', 'origin', remote], { timeout: 10000 })
  await writeFile(join(target, 'history.txt'), 'preserve repository code and history')
  return target
}

describe('repository cloning against real local git ownership', () => {
  it('reuses an existing matching repository for concurrent requests without changing its files or origin', async () => {
    const target = await repository('existing', 'git@github.com:owner/repository.git')
    const [first, second] = await Promise.all([
      worktree.clone('https://github.com/owner/repository', target),
      worktree.clone('https://github.com/owner/repository', target),
    ])
    expect(first).toEqual(second)
    expect(first).toMatchObject({ directory: target, remoteUrl: 'git@github.com:owner/repository.git' })
    expect(await readFile(join(target, 'history.txt'), 'utf8')).toBe('preserve repository code and history')
    expect(await worktree.peek(target)).toMatchObject({ remoteUrl: 'git@github.com:owner/repository.git' })
  })

  it('concurrent different remotes cannot claim the same existing repository path', async () => {
    const target = await repository('racing', 'https://github.com/owner/repository.git')
    const results = await Promise.allSettled([
      worktree.clone('https://github.com/owner/repository', target),
      worktree.clone('https://github.com/other/repository', target),
    ])
    expect(results[0]).toMatchObject({ status: 'fulfilled' })
    expect(results[1]).toMatchObject({ status: 'rejected', reason: new Error('repository_path_conflict') })
    expect(await worktree.peek(target)).toMatchObject({ remoteUrl: 'https://github.com/owner/repository.git' })
  })

  it('rejects an occupied repository with a different remote and preserves all files', async () => {
    const target = await repository('conflict', 'https://github.com/other/repository.git')
    await expect(worktree.clone('https://github.com/owner/repository', target)).rejects.toThrow('repository_path_conflict')
    expect(await readFile(join(target, 'history.txt'), 'utf8')).toBe('preserve repository code and history')
    expect(await worktree.peek(target)).toMatchObject({ remoteUrl: 'https://github.com/other/repository.git' })
  })

  it('rejects a nonrepository directory without deleting its contents', async () => {
    const target = join(directory, 'not-git')
    await mkdir(target)
    await writeFile(join(target, 'keep.txt'), 'not owned by supermesh')
    await expect(worktree.clone('https://github.com/owner/repository', target)).rejects.toThrow('repository_path_conflict')
    expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('not owned by supermesh')
  })

  it('cancellation before cloning rejects without publishing a final repository', async () => {
    const target = join(directory, 'cancelled')
    const controller = new AbortController()
    controller.abort(new Error('test cancellation'))
    await expect(worktree.clone('https://github.com/owner/repository', target, undefined, controller.signal)).rejects.toThrow('test cancellation')
    await expect(readFile(join(target, '.git', 'config'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
