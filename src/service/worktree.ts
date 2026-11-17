import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseRepositoryRemote } from '../utils/repository'
import { defineService } from '../utils/service'

const execute = promisify(execFile)
const operations = new Map<string, Promise<unknown>>()
let controller = new AbortController()
let stopped = false

export const worktree = defineService({
  start(): () => Promise<void> {
    if (operations.size)
      throw new Error('worktree_busy')
    controller = new AbortController()
    stopped = false
    return async () => {
      stopped = true
      controller.abort(new Error('worktree_stopped'))
      await Promise.allSettled([...operations.values()])
    }
  },
  peek(directory: string): Promise<{ directory: string, remoteUrl: string | null } | null> {
    return run(`peek:${resolve(directory)}`, async () => {
      const root = await realpath(directory)
      let gitRoot: string
      try {
        gitRoot = await git(root, ['rev-parse', '--show-toplevel'])
      }
      catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 128 && 'stderr' in error && typeof error.stderr === 'string' && error.stderr.includes('not a git repository'))
          return null
        throw error
      }
      if (!samePath(gitRoot, root))
        return null
      const remotes = (await git(root, ['remote'])).split(String.fromCharCode(10))
      const remoteUrl = remotes.includes('origin') ? await git(root, ['config', '--get', 'remote.origin.url']) : null
      return { directory: root, remoteUrl }
    })
  },
  async clone(remoteUrl: string, target: string, gitlabHost?: string, signal?: AbortSignal): Promise<{ directory: string, remoteUrl: string }> {
    signal?.throwIfAborted()
    const repository = parseRepositoryRemote(remoteUrl, gitlabHost)
    const result = await run(`clone:${process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target)}`, async () => {
      if (!isAbsolute(target))
        throw new Error('invalid_repository_path')
      const existing = await existingRepository(target, repository.webUrl, gitlabHost)
      if (existing)
        return existing
      await mkdir(dirname(target), { recursive: true })
      if (!samePath(await realpath(dirname(target)), dirname(target)))
        throw new Error('repository_path_conflict')
      const temporary = await mkdtemp(join(dirname(target), '.nexus-clone-'))
      try {
        await git(temporary, ['-c', 'http.followRedirects=false', '-c', 'protocol.file.allow=never', 'clone', '--', repository.remoteUrl, temporary], signal, 120000)
        const facts = await worktree.peek(temporary)
        if (!facts?.remoteUrl || parseRepositoryRemote(facts.remoteUrl, gitlabHost).webUrl !== repository.webUrl)
          throw new Error('repository_remote_mismatch')
        signal?.throwIfAborted()
        controller.signal.throwIfAborted()
        const raced = await existingRepository(target, repository.webUrl, gitlabHost)
        if (raced)
          return raced
        await rename(temporary, target)
        return { directory: await realpath(target), remoteUrl: repository.remoteUrl }
      }
      finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })
    if (parseRepositoryRemote(result.remoteUrl, gitlabHost).webUrl !== repository.webUrl)
      throw new Error('repository_path_conflict')
    return result
  },
  async create(directory: string, ticketId: string, branch = 'nexus/'): Promise<{ branch: string, worktree: string }> {
    return run(`create:${resolve(directory)}:${ticketId}`, async () => {
      if (!isAbsolute(directory) || !/^[a-z0-9][\w-]*$/i.test(ticketId))
        throw new Error('invalid_worktree_identity')
      branch ||= 'nexus/'
      if (branch === 'nexus/')
        branch += ticketId
      if (branch.split('/').at(-1) !== ticketId)
        throw new Error('branch_ticket_mismatch')
      const root = await realpath(directory)
      if (!samePath(await git(root, ['rev-parse', '--show-toplevel']), root))
        throw new Error('repository_root_required')
      await git(root, ['check-ref-format', '--branch', branch])
      const target = join(dirname(root), '.nexus-worktrees', basename(root), ticketId)
      try {
        await lstat(target)
      }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
          throw error
        await mkdir(dirname(target), { recursive: true })
        if (!samePath(await realpath(dirname(target)), dirname(target)))
          throw new Error('worktree_parent_conflict')
        await git(root, ['worktree', 'add', '-b', branch, target, 'HEAD'])
        await worktree.verify(root, target, branch)
        return { branch, worktree: target }
      }
      await worktree.verify(root, target, branch)
      return { branch, worktree: target }
    })
  },
  async verify(directory: string, target: string, branch: string): Promise<void> {
    return run(`verify:${resolve(target)}`, async () => {
      const root = await realpath(directory)
      const actual = await realpath(target)
      if (samePath(root, actual) || !samePath(target, actual))
        throw new Error('worktree_path_conflict')
      const registered = (await git(root, ['worktree', 'list', '--porcelain', '-z'])).split('\0\0').map(entry => entry.split('\0')).find(fields => fields.some(field => field.startsWith('worktree ') && samePath(field.slice(9), actual)))
      if (!registered || registered.some(field => field === 'locked' || field.startsWith('locked ')))
        throw new Error('worktree_registration_conflict')
      const rootCommon = resolve(root, await git(root, ['rev-parse', '--git-common-dir']))
      const actualCommon = resolve(actual, await git(actual, ['rev-parse', '--git-common-dir']))
      if (!samePath(rootCommon, actualCommon) || await git(actual, ['branch', '--show-current']) !== branch)
        throw new Error('worktree_branch_conflict')
    })
  },
})

async function existingRepository(target: string, webUrl: string, gitlabHost?: string): Promise<{ directory: string, remoteUrl: string } | null> {
  try {
    const entry = await lstat(target)
    if (!entry.isDirectory() || entry.isSymbolicLink() || !samePath(target, await realpath(target)))
      throw new Error('repository_path_conflict')
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
  const facts = await worktree.peek(target)
  if (!facts?.remoteUrl)
    throw new Error('repository_path_conflict')
  let remote: ReturnType<typeof parseRepositoryRemote>
  try {
    remote = parseRepositoryRemote(facts.remoteUrl, gitlabHost)
  }
  catch { throw new Error('repository_path_conflict') }
  if (remote.webUrl !== webUrl)
    throw new Error('repository_path_conflict')
  return { directory: facts.directory, remoteUrl: remote.remoteUrl }
}

async function git(cwd: string, args: string[], signal?: AbortSignal, timeout = 15000): Promise<string> {
  const operationSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
  operationSignal.throwIfAborted()
  return (await execute('git', args, { cwd, signal: operationSignal, timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=yes -oConnectTimeout=15' } })).stdout.trim()
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right)
}

function run<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (stopped)
    return Promise.reject(new Error('worktree_stopped'))
  const current = operations.get(key)
  if (current)
    return current as Promise<T>
  const task = Promise.resolve().then(action).finally(() => operations.delete(key))
  operations.set(key, task)
  return task
}
