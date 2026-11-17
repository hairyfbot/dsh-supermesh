import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleSessionEvent } from '../src/events/session-event'
import { inbox } from '../src/service/inbox'
import { runtime } from '../src/service/runtime'
import { worker as workerService } from '../src/service/worker'

const mocks = vi.hoisted(() => ({
  db: {
    project: { findById: vi.fn(), listAll: vi.fn() },
    supervisor: { findById: vi.fn() },
    worker: { listRunning: vi.fn(), listQueued: vi.fn(), start: vi.fn(), end: vi.fn(), update: vi.fn(), findById: vi.fn(), setBackgroundUntil: vi.fn(), setRecoveryNote: vi.fn() },
    ticket: { findById: vi.fn(), start: vi.fn(), update: vi.fn(), setPrepareError: vi.fn() },
    ticketThread: { listByTicket: vi.fn() },
    inbox: { listDelivery: vi.fn(), listAnswered: vi.fn(), listByTicket: vi.fn(), findById: vi.fn(), markRead: vi.fn(), resetDelivery: vi.fn(), recordDeliveryFailure: vi.fn(), markStalled: vi.fn() },
  },
  setting: { load: vi.fn() },
  session: { start: vi.fn(), resolve: vi.fn(), findMain: vi.fn(), create: vi.fn(), send: vi.fn(), receipts: vi.fn(), activity: vi.fn(), stop: vi.fn() },
  worktree: { start: vi.fn(), create: vi.fn(), verify: vi.fn() },
  scheduler: { ready: vi.fn(), use: vi.fn() },
  github: { collectAll: vi.fn(), flush: vi.fn() },
  project: { sync: vi.fn() },
}))
vi.mock('../src/service/project', () => ({ project: mocks.project }))
vi.mock('../src/service/setting', () => ({ setting: mocks.setting }))
vi.mock('../src/database', () => ({ db: mocks.db }))
vi.mock('../src/service/session', () => ({ session: mocks.session }))
vi.mock('../src/service/worktree', () => ({ worktree: mocks.worktree }))
vi.mock('../src/runtime/scheduler', () => ({ scheduler: mocks.scheduler }))
vi.mock('../src/channel/github/channel', () => ({ github: mocks.github }))

const settings = { maxWorkers: 1, backgroundLimitMinutes: 5, autoMerge: false, autoMergeMaxLines: 200, deliveryMaxAttempts: 3, deliveryRetryCeilingSeconds: 60, updatedAt: '2026-01-01T00:00:00.000Z' }
function message(id: string, extra: object = {}): any {
  return { id, type: 'main', ticketId: 'T1', message: id, kind: 'notice', status: 'pending', readAt: null, projectId: null, supervisorId: null, nextRetryAt: null, deliveryAttempts: 0, escalations: 0, ...extra }
}
function worker(id: string, extra: object = {}): any {
  return { id, ticketId: 'T1', status: 'running', branch: 'nexus/T1', worktree: '/isolated/T1', reportState: null, backgroundUntil: null, ...extra }
}
let stops: (() => Promise<void>)[] = []
beforeEach(() => {
  vi.resetAllMocks()
  stops = [inbox.start(), workerService.start()]
  mocks.session.start.mockReturnValue(async () => {})
  mocks.worktree.start.mockReturnValue(async () => {})
  mocks.github.collectAll.mockResolvedValue([])
  mocks.github.flush.mockResolvedValue([])
  mocks.setting.load.mockResolvedValue(settings)
  mocks.db.worker.listRunning.mockResolvedValue([])
  mocks.db.worker.listQueued.mockResolvedValue([])
  mocks.db.inbox.listDelivery.mockResolvedValue([])
  mocks.db.inbox.listAnswered.mockResolvedValue([])
  mocks.db.inbox.listByTicket.mockResolvedValue([])
  mocks.db.ticket.findById.mockResolvedValue({ id: 'T1', projectId: 'P1', title: 'Fix', description: 'Details', status: 'queued', paused: 0, prepareError: null })
  mocks.db.project.findById.mockResolvedValue({ id: 'P1', enabled: 1, directory: '/isolated/root', name: 'Project' })
  mocks.db.project.listAll.mockResolvedValue([])
  mocks.db.ticketThread.listByTicket.mockResolvedValue([{ threadId: 'github:issue:1' }])
  mocks.session.findMain.mockResolvedValue('main')
  mocks.session.resolve.mockResolvedValue({ role: 'main' })
  mocks.session.receipts.mockResolvedValue([])
  mocks.session.activity.mockResolvedValue({ running: false, background: false, queued: false })
  mocks.worktree.create.mockResolvedValue({ branch: 'nexus/T1', worktree: '/isolated/T1' })
  mocks.scheduler.use.mockImplementation(() => vi.fn(() => true))
})
afterEach(async () => {
  await Promise.all(stops.map(stop => stop()))
  vi.restoreAllMocks()
})

describe('收件箱投递与答复', () => {
  it('首条失败会阻断同票后续消息，但不阻断其他票', async () => {
    mocks.db.inbox.listDelivery.mockResolvedValue([message('first'), message('second'), message('other', { ticketId: 'T2' })])
    mocks.session.send.mockRejectedValueOnce(new Error('offline'))
    await inbox.deliver()
    expect(mocks.session.send.mock.calls.map(call => call[3])).toEqual(['nexus:inbox:first:0', 'nexus:inbox:other:0'])
    expect(mocks.db.inbox.recordDeliveryFailure).toHaveBeenCalledWith('first', 'offline', expect.any(String))
    expect(mocks.db.inbox.markRead).not.toHaveBeenCalled()
  })
  it('stalled和未到期重试都保序阻断同票', async () => {
    mocks.db.inbox.listDelivery.mockResolvedValue([message('stalled', { status: 'stalled' }), message('later'), message('retry', { ticketId: 'T2', nextRetryAt: '2999-01-01T00:00:00.000Z' }), message('later2', { ticketId: 'T2' })])
    await inbox.deliver()
    expect(mocks.session.send).not.toHaveBeenCalled()
  })
  it('第三次失败转stalled，恢复后的消费回执只标read不重新发送', async () => {
    mocks.db.inbox.listDelivery.mockResolvedValue([message('third', { deliveryAttempts: 2 })])
    mocks.session.send.mockRejectedValueOnce(new Error('offline'))
    await inbox.deliver()
    expect(mocks.db.inbox.markStalled).toHaveBeenCalledWith('third', 'offline')
    mocks.db.inbox.listDelivery.mockResolvedValue([message('consumed')])
    mocks.session.receipts.mockResolvedValue([{ requestId: 'nexus:inbox:consumed:0', consumedAt: '2026-01-01T00:00:00.000Z' }])
    await inbox.deliver()
    expect(mocks.session.send).toHaveBeenCalledTimes(1)
    expect(mocks.db.inbox.markRead).toHaveBeenCalledWith(['consumed'], '2026-01-01T00:00:00.000Z')
  })
  it('答复临时发送失败后可重试且稳定requestId不改变', async () => {
    const row = message('ask', { status: 'done', kind: 'ask', origin: 'worker', workerId: 'W1', answer: 'yes' })
    mocks.db.inbox.listAnswered.mockResolvedValue([row])
    mocks.db.worker.findById.mockResolvedValue(worker('W1'))
    mocks.session.send.mockRejectedValueOnce(new Error('offline'))
    await inbox.deliverAnswers()
    await inbox.deliverAnswers()
    await inbox.deliverAnswers()
    expect(mocks.session.send).toHaveBeenCalledTimes(2)
    expect(mocks.session.send.mock.calls.map(call => call[3])).toEqual(['nexus:answer:ask', 'nexus:answer:ask'])
  })
  it('运行中的编排不接收轮询唤醒消息', async () => {
    mocks.db.inbox.listDelivery.mockResolvedValue([message('busy')])
    mocks.session.activity.mockResolvedValue({ running: true, background: false })
    await inbox.deliver()
    expect(mocks.session.send).not.toHaveBeenCalled()
  })
})

describe('worker槽位与恢复', () => {
  it('并发满时不创建工作树或会话', async () => {
    mocks.db.worker.listRunning.mockResolvedValue([worker('running')])
    mocks.db.worker.listQueued.mockResolvedValue([worker('queued', { status: 'queued' })])
    await workerService.reconcile()
    expect(mocks.worktree.create).not.toHaveBeenCalled()
    expect(mocks.session.create).not.toHaveBeenCalled()
  })
  it('并发调用只派发一次并在发送前占用槽位', async () => {
    mocks.db.worker.listQueued.mockResolvedValue([worker('queued', { status: 'queued', worktree: null })])
    await Promise.all([workerService.reconcile(), workerService.reconcile()])
    expect(mocks.session.create).toHaveBeenCalledTimes(1)
    expect(mocks.db.worker.start).toHaveBeenCalledWith('queued', expect.any(String))
    expect(mocks.db.worker.start.mock.invocationCallOrder[0]).toBeLessThan(mocks.session.send.mock.invocationCallOrder[0]!)
    expect(mocks.session.send).toHaveBeenCalledWith('queued', expect.stringContaining('github:issue:1'), 'queue', 'nexus:worker:queued')
  })
  it('工作树准备失败记录错误且不占槽位', async () => {
    mocks.db.worker.listQueued.mockResolvedValue([worker('queued', { status: 'queued', worktree: null })])
    mocks.worktree.create.mockRejectedValue(new Error('git failed'))
    await workerService.reconcile()
    expect(mocks.db.ticket.setPrepareError).toHaveBeenCalledWith('T1', 'git failed', expect.any(String))
    expect(mocks.db.worker.start).not.toHaveBeenCalled()
  })
  it('后台停止未收敛时不能释放槽位', async () => {
    mocks.db.worker.listRunning.mockResolvedValue([worker('W1', { backgroundUntil: '2000-01-01T00:00:00.000Z' })])
    mocks.session.stop.mockRejectedValue(new Error('background_stop_pending'))
    await expect(workerService.reconcileBackground()).rejects.toThrow('background_stop_pending')
    expect(mocks.db.worker.end).not.toHaveBeenCalled()
  })
  it('恢复先验证原工作树且带防重复外部操作提示', async () => {
    mocks.db.worker.listRunning.mockResolvedValue([worker('W1')])
    await workerService.recover()
    expect(mocks.worktree.verify).toHaveBeenCalledWith('/isolated/root', '/isolated/T1', 'nexus/T1')
    expect(mocks.session.send).toHaveBeenCalledWith('W1', expect.stringContaining('不要重复开 PR'), 'queue', expect.stringContaining('nexus:recovery:'))
    expect(mocks.worktree.create).not.toHaveBeenCalled()
  })
})

describe('事件释放与生命周期', () => {
  it('ready回合结束仍有后台时保留槽位并写截止时间', async () => {
    mocks.session.resolve.mockResolvedValue({ role: 'worker', workerId: 'W1', ticketId: 'T1' })
    mocks.db.worker.findById.mockResolvedValue(worker('W1', { reportState: 'ready' }))
    mocks.session.activity.mockResolvedValue({ running: false, background: true })
    await handleSessionEvent({ id: 'W1' } as any, { type: 'turn/end', seq: 2, time: Date.now(), data: { reason: { kind: 'completed' } } } as any)
    expect(mocks.db.worker.setBackgroundUntil).toHaveBeenCalledWith('W1', expect.any(String))
    expect(mocks.db.worker.end).not.toHaveBeenCalled()
    expect(mocks.db.ticket.update).not.toHaveBeenCalled()
  })
  it('无后台的ready回合结束进入review并释放Worker', async () => {
    mocks.session.resolve.mockResolvedValue({ role: 'worker', workerId: 'W1', ticketId: 'T1' })
    mocks.db.worker.findById.mockResolvedValue(worker('W1', { reportState: 'ready' }))
    await handleSessionEvent({ id: 'W1' } as any, { type: 'turn/end', seq: 2, time: Date.now(), data: { reason: { kind: 'completed' } } } as any)
    expect(mocks.db.worker.end).toHaveBeenCalledWith('W1', 'completed', expect.any(String))
    expect(mocks.db.ticket.update).toHaveBeenCalledWith('T1', { status: 'review', updatedAt: expect.any(String) })
  })
  it('仅激活时注册scheduler任务且卸载等待进行中操作', async () => {
    expect(mocks.scheduler.use).not.toHaveBeenCalled()
    const dispose = await runtime.start()
    expect(mocks.scheduler.use.mock.calls.map(call => call[0].id)).toEqual(['nexus:runtime', 'nexus:github'])
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    mocks.db.inbox.listDelivery.mockReturnValue(pending.then(() => []))
    const delivery = inbox.deliver()
    await vi.waitFor(() => expect(mocks.db.inbox.listDelivery).toHaveBeenCalled())
    let stopped = false
    const stopping = dispose().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    await expect(inbox.deliver()).rejects.toThrow('inbox_stopped')
    release()
    await delivery
    await stopping
    expect(stopped).toBe(true)
    expect(mocks.scheduler.use.mock.results.map(result => result.value.mock.calls.length)).toEqual([1, 1])
    expect(mocks.session.create).not.toHaveBeenCalled()
  })
})
