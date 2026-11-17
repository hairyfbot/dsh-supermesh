import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { session } from '../src/service/session'

const mocks = vi.hoisted(() => ({
  db: { worker: { findById: vi.fn() }, project: { findBySession: vi.fn(), findById: vi.fn(), setOrchestrator: vi.fn() }, supervisor: { findBySession: vi.fn(), findById: vi.fn(), attachSession: vi.fn() }, ticket: { findById: vi.fn() } },
  host: { workspaceRegistry: { archivedSessionIds: [] as string[] }, sessionQuery: { readSession: vi.fn(), listSessions: vi.fn() }, sessionController: { create: vi.fn(), prompt: vi.fn(), rename: vi.fn(), resolveAgent: vi.fn(), state: vi.fn() }, waterfall: vi.fn(), parallel: vi.fn() },
  mkdir: vi.fn(),
}))
vi.mock('../src/database', () => ({ db: mocks.db }))
vi.mock('../src/server', () => ({ server: {} }))
vi.mock('dsh-h3/utils', () => ({ getServerContext: () => mocks.host }))
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir }))
vi.mock('@deepseek-ai/dsh-session', () => ({ SessionId: (id: string) => id }))

let stopService: () => Promise<void>
beforeEach(() => {
  vi.resetAllMocks()
  stopService = session.start()
  mocks.host.workspaceRegistry.archivedSessionIds = []
  mocks.host.sessionQuery.readSession.mockResolvedValue({ session: { id: 'main', agentPreset: 'orchestrator' }, events: [] })
})
afterEach(async () => {
  await stopService()
  vi.restoreAllMocks()
})

describe('通用会话身份与投递', () => {
  it('项目身份必须同时命中表内绑定和manager预设', async () => {
    mocks.db.project.findBySession.mockResolvedValue({ id: 'P1' })
    mocks.host.sessionQuery.readSession.mockResolvedValue({ session: { id: 'manager', agentPreset: 'manager' }, events: [] })
    await expect(session.resolve('manager')).resolves.toEqual({ role: 'project', projectId: 'P1' })
    mocks.db.project.findBySession.mockResolvedValue(undefined)
    await expect(session.resolve('manager')).resolves.toBeNull()
  })

  it('子代理和归档会话不能继承主编排身份', async () => {
    mocks.host.sessionQuery.readSession.mockResolvedValue({ session: { id: 'child', agentPreset: 'orchestrator', origin: 'subagent' }, events: [] })
    await expect(session.resolve('child')).resolves.toBeNull()
    mocks.host.workspaceRegistry.archivedSessionIds = ['archived']
    await expect(session.resolve('archived')).resolves.toBeNull()
    expect(mocks.db.worker.findById).not.toHaveBeenCalled()
  })

  it('多个主编排会话必须拒绝自动选择收件人', async () => {
    mocks.host.sessionQuery.listSessions.mockResolvedValue([{ header: { id: 'A', agentPreset: 'orchestrator' } }, { header: { id: 'B', agentPreset: 'orchestrator' } }])
    await expect(session.findMain()).rejects.toThrow('ambiguous_main_session')
  })

  it('worker身份由worker主键和工单项目共同解析', async () => {
    mocks.db.worker.findById.mockResolvedValue({ id: 'W1', ticketId: 'T1', status: 'running' })
    mocks.db.ticket.findById.mockResolvedValue({ id: 'T1', projectId: 'P1' })
    mocks.host.sessionQuery.readSession.mockResolvedValue({ session: { id: 'W1', agentPreset: 'worker' }, events: [] })
    await expect(session.resolve('W1')).resolves.toEqual({ role: 'worker', workerId: 'W1', ticketId: 'T1', projectId: 'P1' })
  })

  it('interrupt先保留队列取消当前回合，再用稳定requestId注入', async () => {
    const cancel = vi.fn()
    mocks.host.sessionController.resolveAgent.mockResolvedValue({ agent: { cancel } })
    await session.send('main', '停止错误操作', 'interrupt', 'request-1')
    expect(cancel).toHaveBeenCalledWith({ kind: 'hook', reason: 'nexus_cancel' }, { keepInbox: true })
    expect(mocks.host.sessionController.prompt).toHaveBeenCalledWith({ sessionId: 'main', requestId: 'request-1', mode: 'steer', content: [{ type: 'text', text: '停止错误操作' }] }, expect.any(AbortSignal))
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.host.sessionController.prompt.mock.invocationCallOrder[0]!)
  })

  it('会话正文读取使用assistant.message并保留分页边界', async () => {
    mocks.host.sessionQuery.readSession.mockResolvedValue({ session: { id: 'main', agentPreset: 'orchestrator' }, events: [
      { type: 'user/message', data: { content: [{ type: 'text', text: 'hello' }] } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'world' }] } } },
    ] })
    await expect(session.view('main', 0, 7)).resolves.toEqual({ text: `hello${String.fromCharCode(10, 10)}`, next_offset: 7 })
    await expect(session.view('main', 7, 7)).resolves.toEqual({ text: 'world', next_offset: null })
    await expect(session.view('main', -1)).rejects.toThrow('invalid_page')
  })

  it('仅进入已完成回合的消息产生消费回执', async () => {
    mocks.host.sessionQuery.readSession.mockResolvedValue({ session: {}, events: [
      { type: 'turn/start' },
      { type: 'user/message', data: { source: { kind: 'user', rpcId: 'done' } } },
      { type: 'turn/end', time: 1000, data: { reason: { kind: 'completed' } } },
      { type: 'turn/start' },
      { type: 'user/message', data: { source: { kind: 'user', rpcId: 'cancelled' } } },
      { type: 'turn/end', time: 2000, data: { reason: { kind: 'aborted' } } },
    ] })
    await expect(session.receipts('main')).resolves.toEqual([{ requestId: 'done', consumedAt: '1970-01-01T00:00:01.000Z' }])
  })

  it('同项目不同Worker并发创建返回各自会话ID', async () => {
    mocks.db.project.findById.mockResolvedValue({ id: 'P1', directory: '/isolated/project' })
    mocks.db.worker.findById.mockImplementation(async (id: string) => ({ id, ticketId: id === 'W1' ? 'T1' : 'T2', status: 'queued' }))
    mocks.host.sessionController.create.mockImplementation(async (request: { sessionId: string }) => ({ sessionId: request.sessionId }))
    const ids = await Promise.all([
      session.create('worker', { projectId: 'P1', sessionId: 'W1', ticketId: 'T1' }),
      session.create('worker', { projectId: 'P1', sessionId: 'W2', ticketId: 'T2' }),
    ])
    expect(ids).toEqual(['W1', 'W2'])
    expect(mocks.host.sessionController.create).toHaveBeenCalledTimes(2)
  })

  it('关闭期间拒绝新投递且不访问宿主', async () => {
    await stopService()
    await expect(session.send('main', 'message')).rejects.toThrow('runtime_stopping')
    expect(mocks.host.sessionController.prompt).not.toHaveBeenCalled()
  })
})
