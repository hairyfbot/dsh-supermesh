import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'

declare module 'vitest/browser' {
  interface BrowserCommands {
    openSupermeshMainSession: () => Promise<{ sessionId: string, panelSessionId: unknown, errors: string[] }>
  }
}

describe('supermesh main session in an isolated official DSH instance', () => {
  beforeAll(async () => {
    await commands.launchDsh()
    await commands.openDshPage()
  })
  afterAll(async () => {
    await commands.closeDsh()
  })

  it('creates and reuses the real main session through its UI without injection errors', async () => {
    const first = await commands.openSupermeshMainSession()
    expect(first.sessionId).toEqual(expect.any(String))
    expect(first.sessionId.length).toBeGreaterThan(0)
    expect(first.panelSessionId).toBe(first.sessionId)
    expect(first.errors).toEqual([])
    const second = await commands.openSupermeshMainSession()
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.panelSessionId).toBe(first.sessionId)
    expect(second.errors).toEqual([])
  })
})
