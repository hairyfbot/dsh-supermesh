import { describe, expect, it } from 'vitest'
import { singlet } from '@/runtime/singlet'

describe('singlet single-flight primitive', () => {
  it('reuses the in-flight promise for the same key instead of running twice', async () => {
    let runs = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const task = singlet('test:shared', async () => {
      runs++
      await gate
      return runs
    })
    const first = task()
    const second = task()
    await Promise.resolve()
    expect(runs).toBe(1)
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 1])
    expect(runs).toBe(1)
  })

  it('serializes nothing but isolates different keys', async () => {
    const seen: string[] = []
    const task = singlet((id: string) => `test:keyed:${id}`, async (id: string) => {
      seen.push(id)
      await new Promise(resolve => setTimeout(resolve, 10))
      return id
    })
    await expect(Promise.all([task('a'), task('b')])).resolves.toEqual(['a', 'b'])
    expect(seen).toEqual(['a', 'b'])
  })

  it('runs again once the previous call settled', async () => {
    let runs = 0
    const task = singlet('test:sequential', async () => ++runs)
    await expect(task()).resolves.toBe(1)
    await expect(task()).resolves.toBe(2)
    expect(runs).toBe(2)
  })

  it('runs immediately through singlet.immediate without a trailing call', async () => {
    let runs = 0
    await expect(singlet.immediate('test:immediate', async () => ++runs)).resolves.toBe(1)
    await expect(singlet.immediate('test:immediate', async () => ++runs)).resolves.toBe(2)
    expect(runs).toBe(2)
  })

  it('immediate reuses the in-flight promise and forwards arguments', async () => {
    let runs = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = singlet.immediate('test:immediate-shared', async () => {
      runs++
      await gate
      return runs
    })
    const second = singlet.immediate('test:immediate-shared', async () => {
      runs++
      await gate
      return runs
    })
    await Promise.resolve()
    expect(runs).toBe(1)
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([1, 1])
    await expect(singlet.immediate((id: string) => `test:immediate:${id}`, async (id: string) => id.toUpperCase(), 'abc')).resolves.toBe('ABC')
  })

  it('reports busy keys and drains pending work', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const task = singlet('test:drain', async () => {
      await gate
    })
    const running = task()
    await Promise.resolve()
    expect(singlet.busy()).toBe(true)
    expect(singlet.busy('test:drain')).toBe(true)
    expect(singlet.keys()).toContain('test:drain')
    release()
    await singlet.drain()
    await running
    expect(singlet.busy('test:drain')).toBe(false)
  })
})
