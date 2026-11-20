import { describe, expect, it } from 'vitest'
import { ChannelError } from '@/channel/_shared/error'
import { courier } from '@/service/courier'

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
