import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'

declare module 'vitest/browser' {
  interface BrowserCommands {
    launchDsh: () => Promise<{ baseUrl: string }>
    openDshPage: () => Promise<{ url: string }>
    nexusRequest: (path: string, method: string, body?: unknown) => Promise<{ status: number, body: unknown }>
    getDshErrors: () => Promise<string[]>
    closeDsh: () => Promise<void>
  }
}

describe('nexus in the official DSH shell', () => {
  let openedUrl = ''
  beforeAll(async () => {
    await commands.launchDsh()
  })
  beforeEach(async () => {
    openedUrl = (await commands.openDshPage()).url
  })
  afterEach(async () => {
    const restored = await commands.nexusRequest('/api/nexus/settings', 'PATCH', { maxWorkers: 10 })
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ maxWorkers: 10 })
  })
  afterAll(async () => {
    await commands.closeDsh()
  })

  it('loads the Nexus client and its authenticated plugin panel route in Chromium', async () => {
    expect(new URL(openedUrl).pathname).toBe('/')
    const panel = await commands.nexusRequest('/api/nexus/panel', 'GET')
    expect(panel.status).toBe(200)
    expect(panel.body).toMatchObject({
      projects: [],
      tickets: [],
      mainSessionId: null,
      graph: { nodes: [], edges: [], groups: [] },
      run: { state: 'idle', reason: null },
      settings: { maxWorkers: 10, autoMerge: false },
    })
    expect(await commands.getDshErrors()).toEqual([])
  })

  it('persists a safe settings change through real services and rejects invalid input without changing it', async () => {
    const saved = await commands.nexusRequest('/api/nexus/settings', 'PATCH', { maxWorkers: 3 })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ maxWorkers: 3, autoMerge: false })
    const invalid = await commands.nexusRequest('/api/nexus/settings', 'PATCH', { maxWorkers: 0 })
    expect(invalid.status).toBe(400)
    expect(invalid.body).toMatchObject({ message: 'invalid_config' })
    const panel = await commands.nexusRequest('/api/nexus/panel', 'GET')
    expect(panel.status).toBe(200)
    expect(panel.body).toMatchObject({
      settings: { maxWorkers: 3, autoMerge: false },
      mainSessionId: null,
      graph: { nodes: [], edges: [], groups: [] },
    })
  })
})
