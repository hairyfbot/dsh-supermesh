import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const installationManifest = pathToFileURL(join(process.env.DSH_INSTALL_DIR, 'package.json'))
const require = createRequire(installationManifest)
const installationModules = new URL('../../', installationManifest).href
let resolving = false
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@deepseek-ai/') && !context.parentURL?.startsWith(installationModules) && !resolving) {
      resolving = true
      try {
        return nextResolve(pathToFileURL(require.resolve(specifier)).href, context)
      }
      finally {
        resolving = false
      }
    }
    return nextResolve(specifier, context)
  },
})

const { register } = await import('tsx/esm/api')
register()
const { Context } = await import('@deepseek-ai/cordis')
const { Loader } = await import('@deepseek-ai/cordis-plugin-loader')
const { WebServer } = await import('@deepseek-ai/dsh-host-webserver')
const { SessionId } = await import('@deepseek-ai/dsh-session')
const { server } = await import('@/server/index.ts')
const { session } = await import('@/service/session.ts')
const { inbox } = await import('@/service/inbox.ts')
const { db } = await import('@/database/index.ts')
const { storage } = await import('@/storage/index.ts')
const { handleAgentCreated } = await import('@/events/agent-created.ts')
const { project: projects } = await import('@/service/project.ts')
const { worktree } = await import('@/service/worktree.ts')
const git = promisify(execFile)
const roles = ['orchestrator', 'manager', 'supervisor', 'worker']
const agentDirectory = join(process.env.DSH_HOME, '.supermesh')
const now = new Date().toISOString()
let runtime

async function start() {
  const ctx = new Context()
  const loader = new Loader(ctx, { baseUrl: pathToFileURL(`${process.env.DSH_INSTALL_DIR}/`).href })
  const webServer = new WebServer(ctx, { host: '127.0.0.1', port: 0 })
  const proposals = []
  ctx.on('agent/pre-step', async ({ agent, messages }) => {
    proposals.push({ id: agent.id, messages: structuredClone(messages) })
    return { kind: 'reject' }
  })
  const rows = [
    ['dsh-llm', {}],
    ['dsh-subprocess-local', {}],
    ['dsh-session', {}],
    ['dsh-session-projection', {}],
    ['dsh-agent', {}],
    ['dsh-tools', {}],
    ['dsh-tool-executor-native', {}],
    ['dsh-system-prompt', {}],
    ['dsh-agent-loop', {}],
    ['dsh-typert-registry', {}],
    ['dsh-api-remote-access', {}],
    ['dsh-api-gateway', {}],
    ['dsh-session-persistence-jsonl', { root: join(process.env.DSH_HOME, 'sessions') }],
    ['dsh-session-query-sqlite', { path: ':memory:', openAt: 'never' }],
    ['dsh-storage', {}],
    ['dsh-storage-json', { root: join(process.env.DSH_HOME, 'storages') }],
    ['dsh-storage-domain', { backend: 'json' }],
    ['dsh-workspace', {}],
    ['dsh-session-title', { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 }],
    ['dsh-agent-default-model', { provider: 'deepseek-official', model: 'deepseek-chat' }],
    ['dsh-fs-local', {}],
    ['dsh-attachment-local', { dshHome: process.env.DSH_HOME }],
    ['dsh-credentials-local', { dshHome: process.env.DSH_HOME, watch: false }],
    ['dsh-client-connection', {}],
    ['dsh-commands', {}],
    ['dsh-client-file-upload', {}],
    ['dsh-agent-preset-registry', { default: 'orchestrator' }],
    ['dsh-api-session-controller', {}],
  ]
  try {
    const fibers = []
    for (const [name, config] of rows) {
      const module = await import(`@deepseek-ai/${name}`)
      fibers.push([name, ctx.plugin(module.default ?? module, config)])
    }
    for (const [name, fiber] of fibers) {
      await fiber.await()
      assert.equal(fiber.state, 2, `${name} must activate using real official services`)
    }
    const { default: AgentPreset } = await import('@deepseek-ai/dsh-agent-preset')
    for (const id of roles)
      await ctx.plugin(AgentPreset, { id, plugins: [] })
    await loader.await()
    const unregister = roles.map(id => session.register(id))
    const release = server(ctx, { origin: 'http://127.0.0.1', owner: () => true })
    const stopSession = session.start()
    const stopInbox = inbox.start()
    const stopWorktree = worktree.start()
    const stopProjects = projects.start()
    ctx.on('agent/created', ({ agent }) => handleAgentCreated(ctx, agent))
    return {
      ctx,
      proposals,
      async close() {
        await stopInbox()
        await stopSession()
        await stopProjects()
        await stopWorktree()
        await ctx.sessionPersistence.flush()
        await release()
        for (const dispose of unregister) dispose()
        assert.equal(webServer.port, undefined, 'the real WebServer must never listen')
        await ctx.fiber.dispose()
      },
    }
  }
  catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
}

async function project(id, enabled = true) {
  const directory = join(process.cwd(), id)
  await mkdir(directory, { recursive: true })
  const workspace = await runtime.ctx.workspaceRegistry.create(directory, `Repository ${id}`)
  const row = await db.project.upsertWorkspace({ id, workspaceId: workspace.id, name: `Project ${id}`, directory, remoteUrl: `https://example.invalid/${id}.git` }, now)
  if (!enabled)
    await db.project.setEnabled(id, false, now)
  return row
}

async function supervisor(id) {
  await db.supervisor.create({ id, sessionId: null, title: `Coordination ${id}`, reason: 'Integration contract', status: 'active', createdAt: now, closedAt: null })
}

async function enqueue(id, type, refs = {}, extra = {}) {
  return db.inbox.enqueue({ id, type, origin: 'system', kind: 'notice', message: `Private payload ${id}`, ...refs, ...extra })
}

async function settle() {
  await Promise.all(runtime.ctx.agents.list().map(agent => agent.whenIdle()))
  await runtime.ctx.sessionPersistence.flush()
}

async function expectWake(id, count) {
  await settle()
  const notices = runtime.proposals.filter(item => item.id === id).flatMap(item => item.messages).filter(message => message.source.kind === 'supermesh-mailbox')
  assert.equal(notices.length, 1, `${id} must receive exactly one waking internal-mail notice`)
  assert.equal(notices[0].content[0].text, `你有${count}个未处理邮件。用 read_mailbox 读取邮件和项目上下文，处理完成后显式完成邮件。`)
  assert.equal(notices[0].content.some(part => part.type === 'text' && part.text.includes('Private payload')), false)
  const history = await session.history(id)
  assert.equal(history.events.some(event => event.type === 'turn/end' && event.data.reason.kind === 'blocked'), true, 'the real loop must enter and close a rejected turn')
  assert.equal(history.events.some(event => event.type === 'assistant/message' || event.type === 'assistant/attempt'), false, 'pre-step rejection must prevent every model request')
}

const cases = {
  async shell() {
    const { credentialRef } = await import('@deepseek-ai/dsh-credentials')
    const { shell } = await import('@/service/shell.ts')
    const botToken = 'supermesh-synthetic-bot-for-local-cli-only'
    const personalToken = 'supermesh-synthetic-personal-must-not-be-used'
    const metadata = { commitName: 'Supermesh isolated bot', commitEmail: 'supermesh-bot@example.invalid' }
    await runtime.ctx.credentials.set(credentialRef('SUPERMESH_GITHUB_TOKEN'), botToken)
    await db.channel.saveConfiguration('github', 'GitHub', 'https://github.com', true, metadata, { name: 'supermesh-isolated-bot', avatar: null })
    await mkdir(process.env.GH_CONFIG_DIR, { recursive: true })
    await writeFile(join(process.env.GH_CONFIG_DIR, 'hosts.yml'), JSON.stringify({ 'github.com': { oauth_token: personalToken, user: 'ambient-account', git_protocol: 'https' } }), { mode: 0o600 })
    const directory = join(process.cwd(), 'shell-repository')
    const linked = join(process.cwd(), 'shell-linked-worktree')
    await mkdir(directory)
    await git('git', ['init'], { cwd: directory })
    await git('git', ['remote', 'add', 'origin', 'https://github.com/example/supermesh-shell.git'], { cwd: directory })
    await git('git', ['-c', 'user.name=Initial author', '-c', 'user.email=initial@example.invalid', '-c', 'core.hooksPath=', '-c', 'commit.gpgSign=false', 'commit', '--allow-empty', '-m', 'Initialize isolated test repository'], { cwd: directory })
    await git('git', ['worktree', 'add', '-b', 'dsh/shell-test', linked], { cwd: directory })
    const workspace = await runtime.ctx.workspaceRegistry.create(directory, 'Shell repository')
    await projects.sync()
    assert.equal((await db.project.findByWorkspace(workspace.id)).enabled, 1)
    const gitlabHost = 'gitlab.example.invalid'
    const gitlabToken = 'supermesh-synthetic-gitlab-bot-local-only'
    const gitlabMetadata = { commitName: 'Supermesh GitLab bot', commitEmail: 'supermesh-gitlab@example.invalid' }
    const gitlabDirectory = join(process.cwd(), 'shell-gitlab-subgroup')
    if (process.env.SUPERMESH_TEST_GLAB_DIR) {
      await runtime.ctx.credentials.set(credentialRef('SUPERMESH_GITLAB_TOKEN'), gitlabToken)
      await db.channel.saveConfiguration('gitlab', 'GitLab', `https://${gitlabHost}`, true, gitlabMetadata, { name: 'supermesh-gitlab-bot', avatar: null })
      await mkdir(process.env.GLAB_CONFIG_DIR, { recursive: true })
      await writeFile(join(process.env.GLAB_CONFIG_DIR, 'config.yml'), JSON.stringify({ hosts: { [gitlabHost]: { token: personalToken, user: 'ambient-gitlab-account', api_protocol: 'https' } } }), { mode: 0o600 })
      await mkdir(gitlabDirectory)
      await git('git', ['init'], { cwd: gitlabDirectory })
      await git('git', ['remote', 'add', 'origin', `https://${gitlabHost}/group/subgroup/supermesh-shell.git`], { cwd: gitlabDirectory })
      await runtime.ctx.workspaceRegistry.create(gitlabDirectory, 'GitLab subgroup repository')
      await projects.sync()
    }
    const original = { ...process.env }
    process.env.GH_TOKEN = personalToken
    const before = { ...process.env }
    let stop
    const run = async (argv, cwd = directory, input, env, timeout = 15000) => {
      const handle = runtime.ctx.subprocess.spawn({ argv, cwd, env, signal: AbortSignal.timeout(timeout), graceMs: 2000, stdio: { stdin: input === undefined ? 'ignore' : { data: input }, stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } } })
      const outcome = await handle.done
      return { code: outcome.exitCode, output: handle.collected.stdout.readFrom(0).text, error: handle.collected.stderr.readFrom(0).text }
    }
    const nativeShell = command => process.platform === 'win32' ? ['pwsh', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `${command}; exit $LASTEXITCODE`] : ['bash', '-c', command]
    // 原生 shell 每次要串起 pwsh/bash → cmd → gh，冷启动在 CI 上能到十几秒，10 秒预算会把冷启动当成失败。
    const native = (command, cwd = directory, env) => run(nativeShell(command), cwd, undefined, env, 30000)
    const describeRun = result => `exit=${result.code} stdout=${JSON.stringify(result.output)} stderr=${JSON.stringify(result.error)}`
    try {
      assert.equal((await runtime.ctx.credentials.resolve(credentialRef('SUPERMESH_GITHUB_TOKEN'))).value === botToken, true, 'GitHub credential must survive GitLab credential registration')
      stop = await shell.start()
      assert.equal(process.env.GH_TOKEN === undefined, true, 'start must remove ambient personal tokens')
      const auth = await native('gh auth token', directory, { GH_TOKEN: personalToken, GITHUB_TOKEN: personalToken })
      assert.equal(auth.code, 0, `real native shell must resolve the gh shim (${describeRun(auth)})`)
      assert.equal(auth.output.trim() === botToken, true, `gh shim must ignore personal env and use the private bot config (personal=${auth.output.trim() === personalToken}, botIncluded=${auth.output.includes(botToken)}, gitlab=${auth.output.trim() === gitlabToken}, chars=${auth.output.trim().length})`)
      const credential = await run(['git', 'credential', 'fill'], directory, 'protocol=https\nhost=github.com\n\n')
      assert.equal(credential.code, 0, 'git must use the configured native gh credential helper')
      assert.equal(credential.output.includes(`password=${botToken}`), true, 'git helper must return only the isolated bot credential')
      assert.equal(credential.output.includes(personalToken), false)
      const other = await run(['git', 'credential', 'fill'], directory, 'protocol=https\nhost=other.example.invalid\n\n')
      assert.notEqual(other.code, 0, 'unconfigured credential hosts must fail without prompting')
      assert.equal(`${other.output}${other.error}`.includes(botToken), false)
      assert.equal(`${other.output}${other.error}`.includes(personalToken), false)
      for (const cwd of [directory, linked]) {
        const name = await run(['git', 'config', 'user.name'], cwd)
        const email = await run(['git', 'config', 'user.email'], cwd)
        assert.equal(name.code, 0, `${cwd === directory ? 'main repository' : 'linked worktree'} must resolve commit name`)
        assert.equal(name.output.trim(), metadata.commitName)
        assert.equal(email.code, 0, `${cwd === directory ? 'main repository' : 'linked worktree'} must resolve commit email`)
        assert.equal(email.output.trim(), metadata.commitEmail)
      }
      const merging = await native('gh-default auth token', directory, { GH_TOKEN: personalToken, GITHUB_TOKEN: personalToken })
      assert.equal(`${merging.output}${merging.error}`.includes(botToken), false, 'the default-login merge entry must never answer with the bot credential')
      assert.notEqual(merging.output.trim(), botToken)
      if (process.env.SUPERMESH_TEST_GLAB_DIR) {
        const auth = await native(`glab config get token --host ${gitlabHost}`, gitlabDirectory, { GITLAB_TOKEN: personalToken, GLAB_TOKEN: personalToken, OAUTH_TOKEN: personalToken, CI_JOB_TOKEN: personalToken })
        assert.equal(auth.code, 0, `real portable glab must run through the native shell shim (${describeRun(auth)})`)
        assert.equal(auth.output.trim() === gitlabToken, true, 'glab shim must select the private bot config rather than ambient tokens/config')
        const credential = await run(['git', 'credential', 'fill'], gitlabDirectory, `protocol=https\nhost=${gitlabHost}\n\n`)
        assert.equal(credential.code, 0, 'GitLab credential helper must execute the real glab')
        assert.equal(credential.output.includes(`password=${gitlabToken}`), true)
        assert.equal(credential.output.includes(personalToken), false)
        const name = await run(['git', 'config', 'user.name'], gitlabDirectory)
        const email = await run(['git', 'config', 'user.email'], gitlabDirectory)
        assert.equal(name.output.trim(), gitlabMetadata.commitName)
        assert.equal(email.output.trim(), gitlabMetadata.commitEmail)
        await db.channel.setEnabled('gitlab', false)
        await shell.refresh()
        const disabled = await native(`glab config get token --host ${gitlabHost}`, gitlabDirectory, { GITLAB_TOKEN: personalToken, GLAB_TOKEN: personalToken })
        assert.equal(disabled.output.trim().length === 0, true, 'disabled GitLab config must not expose any ambient or keyring credential')
        assert.equal(`${disabled.output}${disabled.error}`.includes(gitlabToken), false)
        assert.equal(`${disabled.output}${disabled.error}`.includes(personalToken), false)
        const disabledCredential = await run(['git', 'credential', 'fill'], gitlabDirectory, `protocol=https\nhost=${gitlabHost}\n\n`)
        assert.notEqual(disabledCredential.code, 0, 'disabled GitLab must not answer git credential requests')
        assert.equal(`${disabledCredential.output}${disabledCredential.error}`.includes(gitlabToken), false)
        assert.equal(`${disabledCredential.output}${disabledCredential.error}`.includes(personalToken), false)
        process.stdout.write('SUPERMESH_GLAB_REAL_PASS\n')
      }
      await db.channel.setEnabled('github', false)
      await shell.refresh()
      const disabled = await native('gh auth token', directory, { GH_TOKEN: personalToken, GITHUB_TOKEN: personalToken })
      assert.notEqual(disabled.code, 0, 'disabled channel must not fall back to ambient CLI login or token')
      assert.equal(`${disabled.output}${disabled.error}`.includes(botToken), false)
      assert.equal(`${disabled.output}${disabled.error}`.includes(personalToken), false)
      await stop()
      stop = undefined
      const keys = new Set([...Object.keys(before), ...Object.keys(process.env)])
      assert.equal([...keys].every(key => process.env[key] === before[key]), true, 'stop must restore every changed process environment entry')
    }
    finally {
      if (stop)
        await stop()
      if (original.GH_TOKEN === undefined)
        delete process.env.GH_TOKEN
      else
        process.env.GH_TOKEN = original.GH_TOKEN
    }
  },
  async projectSync() {
    const directory = join(process.cwd(), 'real-repository')
    await mkdir(directory)
    await git('git', ['init'], { cwd: directory })
    await git('git', ['remote', 'add', 'origin', 'https://github.com/example/supermesh-project.git'], { cwd: directory })
    const workspace = await runtime.ctx.workspaceRegistry.create(directory, 'Real repository')
    await projects.sync()
    const initial = await db.project.findByWorkspace(workspace.id)
    assert.equal(initial.enabled, 1)
    assert.equal(initial.remoteUrl, 'https://github.com/example/supermesh-project')
    assert.equal((await projects.list()).find(row => row.id === initial.id).available, true)
    await db.project.setEnabled(initial.id, false, now)
    await projects.sync()
    assert.equal((await db.project.findById(initial.id)).enabled, 0)
    await db.project.setEnabled(initial.id, true, now)
    await git('git', ['remote', 'remove', 'origin'], { cwd: directory })
    await projects.sync()
    assert.equal((await db.project.findById(initial.id)).enabled, 0)
    assert.equal((await projects.list()).find(row => row.id === initial.id).available, false)
    await git('git', ['remote', 'add', 'origin', 'git@github.com:example/supermesh-project.git'], { cwd: directory })
    await projects.sync()
    assert.equal((await db.project.findById(initial.id)).enabled, 0)
    await db.project.setEnabled(initial.id, true, now)
    assert.equal(await runtime.ctx.workspaceRegistry.delete(workspace.id), true)
    await projects.sync()
    assert.equal((await db.project.findById(initial.id)).enabled, 0)
    assert.equal((await projects.list()).find(row => row.id === initial.id).available, false)
    assert.equal((await stat(directory)).isDirectory(), true)
    const replacement = await runtime.ctx.workspaceRegistry.create(directory, 'Re-added repository')
    await projects.sync()
    assert.notEqual(replacement.id, workspace.id)
    assert.equal((await db.project.findByWorkspace(replacement.id)).enabled, 1)
    assert.equal((await db.project.findById(initial.id)).enabled, 0)
  },
  async workspace() {
    const p = await project('workspace-project')
    await supervisor('workspace-supervisor')
    const workspace = await session.workspace()
    const manual = await runtime.ctx.sessionController.create({ cwd: agentDirectory, agentPreset: 'orchestrator' })
    assert.equal(await session.findMain(), manual.sessionId, 'manual main attach must retain its identity as the canonical main')
    assert.deepEqual(workspace.sessionIds, [manual.sessionId], 'manual main attach must bind its existing official workspace')
    await runtime.ctx.sessionController.rename({ sessionId: manual.sessionId, title: '[路由] 主编排' })
    const ids = await Promise.all([
      session.create('main', { directory: p.directory, title: 'Ignored main title' }),
      session.create('project', { projectId: p.id, directory: p.directory, title: 'Ignored project title' }),
      session.create('supervisor', { supervisorId: 'workspace-supervisor', directory: p.directory }),
    ])
    assert.equal(ids[0], manual.sessionId, 'create must reuse the manually attached main instead of duplicating it')
    assert.equal(workspace.title, '代理工作区')
    assert.equal(workspace.path, agentDirectory)
    assert.deepEqual(new Set(workspace.sessionIds), new Set(ids))
    assert.deepEqual(runtime.ctx.workspaceRegistry.get(p.workspaceId).sessionIds, [])
    for (const [index, id] of ids.entries()) {
      assert.equal((await session.history(id)).session.cwd, agentDirectory)
      assert.equal((await runtime.ctx.sessionQuery.readTitle(SessionId(id))).title, ['[路由] 主编排', '[路由] Project workspace-project', '[协调] Coordination workspace-supervisor'][index])
    }
    await settle()
    for (const id of ids)
      await workspace.detachSession(SessionId(id))
    assert.deepEqual(workspace.sessionIds, [], 'official detach leaves existing role sessions ungrouped')
    await runtime.close()
    runtime = await start()
    const restored = await session.workspace()
    assert.equal(restored.id, workspace.id)
    assert.deepEqual(restored.sessionIds, [], 'unassignment must persist before the role binding is reused')
    const histories = await Promise.all(ids.map(id => session.history(id)))
    assert.equal(await session.create('main', {}), ids[0])
    assert.equal(await session.create('project', { projectId: p.id }), ids[1])
    assert.equal(await session.create('supervisor', { supervisorId: 'workspace-supervisor' }), ids[2])
    assert.deepEqual(new Set(restored.sessionIds), new Set(ids), 'reusing every non-worker binding restores official workspace membership')
    for (const [index, id] of ids.entries())
      assert.deepEqual(await session.history(id), histories[index], 'workspace recovery must preserve the complete header and event history')
    assert.deepEqual(new Set((await runtime.ctx.sessionPersistence.list()).map(snapshot => snapshot.header.id)), new Set(ids), 'recovery must not create duplicate sessions')
    assert.equal(runtime.ctx.agents.list().length, 0, 'binding reuse and workspace lookup must not activate cold Agents')
    assert.equal((await session.activate(ids[2])).id, ids[2])
    assert.equal(runtime.ctx.agents.list().length, 1)
    await restored.detachSession(SessionId(ids[0]))
    const main = await runtime.ctx.sessionController.resolveAgent(SessionId(ids[0]))
    assert.equal('agent' in main, true)
    assert.equal(main.agent.id, ids[0])
    assert.equal(restored.sessionIds.includes(SessionId(ids[0])), true, 'resuming an ungrouped main must restore membership through attach')
    assert.equal(await session.attach(main.agent), 'main')
    assert.equal(restored.sessionIds.filter(id => id === ids[0]).length, 1, 'repeated attach must remain idempotent')
    await runtime.close()
    runtime = await start()
    assert.deepEqual(new Set((await session.workspace()).sessionIds), new Set(ids), 'repaired membership must survive another restart')
    await storage.removeItem('orchestrator.id')
    const legacy = await runtime.ctx.sessionController.create({ cwd: p.directory, agentPreset: 'orchestrator' })
    assert.equal(await session.findMain(), legacy.sessionId, 'an existing main in a different immutable cwd must retain its identity')
    const legacyHistory = await session.history(legacy.sessionId)
    assert.equal(await session.create('main', {}), legacy.sessionId, 'unsupported cross-directory migration must not create a duplicate main')
    assert.deepEqual(await session.history(legacy.sessionId), legacyHistory, 'legacy headers and history must remain untouched')
    assert.equal((await session.workspace()).sessionIds.includes(legacy.sessionId), false, 'official attach cannot move a Session with a different immutable cwd')
  },
  async createMail() {
    const p = await project('mail-project')
    await supervisor('mail-supervisor')
    await enqueue('main-mail-1', 'main')
    await enqueue('main-mail-2', 'main')
    await enqueue('project-mail', 'project', { projectId: p.id })
    await enqueue('supervisor-mail', 'supervisor', { supervisorId: 'mail-supervisor' })
    await inbox.deliver()
    const main = await session.findMain()
    const manager = (await db.project.findById(p.id)).orchestratorSessionId
    const coordinator = (await db.supervisor.findById('mail-supervisor')).sessionId
    assert.equal(typeof main, 'string')
    assert.equal(typeof manager, 'string')
    assert.equal(typeof coordinator, 'string')
    await expectWake(main, 2)
    await expectWake(manager, 1)
    await expectWake(coordinator, 1)
    assert.equal((await inbox.peek(main)).pendingCount, 2)
    assert.equal((await db.inbox.findById('main-mail-1')).readAt, null)
    assert.equal((await db.inbox.findById('main-mail-1')).status, 'pending')
  },
  async resumeMail() {
    const p = await project('resume-project')
    await supervisor('resume-supervisor')
    const ids = [
      await session.create('main', {}),
      await session.create('project', { projectId: p.id }),
      await session.create('supervisor', { supervisorId: 'resume-supervisor' }),
    ]
    await runtime.close()
    runtime = await start()
    assert.equal(runtime.ctx.agents.list().length, 0)
    assert.equal(await session.lookup(ids[0]), null)
    await enqueue('resume-main', 'main')
    await enqueue('resume-project', 'project', { projectId: p.id })
    await enqueue('resume-supervisor', 'supervisor', { supervisorId: 'resume-supervisor' })
    await inbox.deliver()
    assert.deepEqual(new Set(runtime.ctx.agents.list().map(agent => agent.id)), new Set(ids))
    for (const id of ids) await expectWake(id, 1)
    assert.equal((await db.project.findById(p.id)).orchestratorSessionId, ids[1])
    assert.equal((await db.supervisor.findById('resume-supervisor')).sessionId, ids[2])
  },
  async invalidMail() {
    const disabled = await project('disabled-project', false)
    const valid = await project('valid-project')
    await enqueue('invalid-recipient', 'project')
    await enqueue('disabled-recipient', 'project', { projectId: disabled.id })
    await enqueue('valid-recipient', 'project', { projectId: valid.id })
    await inbox.deliver()
    const bad = await db.inbox.findById('invalid-recipient')
    assert.equal(bad.deliveryAttempts, 1)
    assert.equal(bad.deliveryError, 'invalid_inbox_recipient')
    assert.equal((await db.project.findById(disabled.id)).orchestratorSessionId, null)
    assert.equal((await db.inbox.findById('disabled-recipient')).deliveryAttempts, 0)
    const id = (await db.project.findById(valid.id)).orchestratorSessionId
    assert.equal(typeof id, 'string')
    await expectWake(id, 1)
  },
  async channelIsolation() {
    const p = await project('channel-project')
    await enqueue('stalled-channel', 'project', { projectId: p.id }, { origin: 'channel', status: 'stalled' })
    await enqueue('internal-after-channel', 'project', { projectId: p.id })
    await inbox.deliver()
    const id = (await db.project.findById(p.id)).orchestratorSessionId
    assert.equal(typeof id, 'string')
    await expectWake(id, 1)
    assert.equal((await db.inbox.findById('stalled-channel')).status, 'stalled')
    assert.equal((await db.inbox.findById('internal-after-channel')).deliveryAttempts, 0)
  },
  async workerEnd() {
    const p = await project('worker-end-project')
    await db.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 0, host: null, createdAt: now }).onConflict(oc => oc.column('id').doNothing()).execute()
    const { worker: workers } = await import('@/service/worker.ts')
    const ticketId = 'worker-end-ticket'
    await db.ticket.create({ id: ticketId, projectId: p.id, channelId: 'github', title: '票已结束的 Worker', description: null, status: 'waiting', createdAt: now, updatedAt: now, startedAt: null, endedAt: null, prUrl: null, prState: null, ciState: null, paused: 0, prepareError: null })
    const queued = await db.worker.queue(ticketId, p.id)
    await db.worker.start(queued.id, now)
    await db.ticket.update(ticketId, { status: 'done', endedAt: now, updatedAt: now })
    await workers.reconcile()
    assert.equal((await db.worker.findById(queued.id)).status, 'ended', '票进终态后它还在 running 的 Worker 必须被结束')
    assert.equal((await db.worker.findById(queued.id)).endedReason, 'stopped')
    assert.equal((await db.worker.listRunning()).length, 0)
  },
}

try {
  const manifest = require('@deepseek-ai/dsh/package.json')
  assert.equal(manifest.name, '@deepseek-ai/dsh')
  assert.equal(process.cwd(), process.env.SUPERMESH_TEST_CWD)
  assert.equal(process.env.DSH_HOME, join(process.cwd(), 'home'))
  assert.equal(Object.hasOwn(cases, process.argv[2]), true, 'unknown integration case')
  runtime = await start()
  await cases[process.argv[2]]()
  process.stdout.write(`SUPERMESH_RUNTIME_PASS ${process.argv[2]} DSH=${manifest.version}\n`)
}
finally {
  if (runtime)
    await runtime.close()
  await storage.dispose()
  await db.destroy()
}
