import type { ThreadRow } from '@/service/courier.types'
import { describe, expect, it } from 'vitest'
import { ChannelError } from '@/channel/_shared/error'
import { courier } from '@/service/courier'

const at = '2026-01-01T00:00:00.000Z'

function thread(projectId: string | null, triage: 'pending' | 'claimed' | 'ignored'): ThreadRow {
  return { id: 'github:owner/repo:1', channelId: 'github', projectId, refId: 'owner/repo:1', kind: 'issue', title: 'Issue', url: 'https://github.com/owner/repo/issues/1', createdAt: at, updatedAt: at, triage, triagedAt: null }
}

describe('渠道分页切片', () => {
  it('按 offset 与 limit 切片并给出下一页偏移', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(courier.page(items, 0, 2)).toEqual({ items: ['a', 'b'], next_offset: 2 })
    expect(courier.page(items, 2, 2)).toEqual({ items: ['c', 'd'], next_offset: null })
    expect(courier.page(items, 4, 2)).toEqual({ items: [], next_offset: null })
  })
  it('拒绝越界分页参数', () => {
    for (const [offset, limit] of [[-1, 10], [0, 0], [0, 101], [0.5, 10], [0, 1.5]])
      expect(() => courier.page([], offset as number, limit as number)).toThrow('invalid_pagination')
  })
})

describe('触发邮件的收件人', () => {
  it('没票跟随时仍投给主编排，但带上话题已匹配的项目', () => {
    expect(courier.route(thread('p1', 'pending'), null)).toEqual({ key: 'main', type: 'main', projectId: 'p1', ticketId: null })
  })
  it('已分诊的话题直接投给项目', () => {
    expect(courier.route(thread('p1', 'claimed'), null)).toEqual({ key: 'p1', type: 'project', projectId: 'p1', ticketId: null })
  })
  it('没有匹配项目时归属为空，主编排看到的是事实而不是猜测', () => {
    expect(courier.route(thread(null, 'pending'), null)).toEqual({ key: 'main', type: 'main', projectId: null, ticketId: null })
  })
  it('有票跟随时投给票所在项目', () => {
    expect(courier.route(thread('p1', 'pending'), { id: 'T-1', projectId: 'p2' })).toEqual({ key: 'p2', type: 'project', projectId: 'p2', ticketId: 'T-1' })
  })
})

describe('渠道错误归一', () => {
  it('渠道错误取错误码，未知错误归为传输失败，中断单独标记', () => {
    expect(courier.failure(new ChannelError('rate_limited'), false)).toBe('rate_limited')
    expect(courier.failure(new Error('boom'), false)).toBe('transport_unknown')
    expect(courier.failure(new Error('boom'), true)).toBe('transport_unknown(boom)')
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(courier.failure(abort, false)).toBe('interrupted')
  })
  it('退避取 retryAfter 与指数退避的较大值并受上限约束', () => {
    expect(courier.retryDelay(new ChannelError('rate_limited', 30), 1, 60)).toBe(30)
    expect(courier.retryDelay(new Error('boom'), 3, 60)).toBe(8)
    expect(courier.retryDelay(new Error('boom'), 10, 60)).toBe(60)
  })
})
