import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'

declare module 'vitest/browser' {
  interface BrowserCommands {
    launchDsh: () => Promise<{ baseUrl: string }>
    openDshPage: () => Promise<{ url: string }>
    supermeshRequest: (path: string, method: string, body?: unknown) => Promise<{ status: number, body: unknown }>
    getDshErrors: () => Promise<string[]>
    closeDsh: () => Promise<void>
  }
}

describe('supermesh in the official DSH shell', () => {
  let openedUrl = ''
  beforeAll(async () => {
    await commands.launchDsh()
  })
  beforeEach(async () => {
    openedUrl = (await commands.openDshPage()).url
  })
  afterEach(async () => {
    const restored = await commands.supermeshRequest('/api/supermesh/setting', 'PATCH', { maxWorkers: 10 })
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ maxWorkers: 10 })
  })
  afterAll(async () => {
    await commands.closeDsh()
  })

  it('loads the Supermesh client and its authenticated resource routes in Chromium', async () => {
    expect(new URL(openedUrl).pathname).toBe('/')
    const [project, ticket, node, edge, group, status, setting] = await Promise.all([
      commands.supermeshRequest('/api/supermesh/project', 'GET'),
      commands.supermeshRequest('/api/supermesh/ticket', 'GET'),
      commands.supermeshRequest('/api/supermesh/node', 'GET'),
      commands.supermeshRequest('/api/supermesh/edge', 'GET'),
      commands.supermeshRequest('/api/supermesh/group', 'GET'),
      commands.supermeshRequest('/api/supermesh/status', 'GET'),
      commands.supermeshRequest('/api/supermesh/setting', 'GET'),
    ])
    expect(project.status).toBe(200)
    expect(project.body).toEqual([])
    expect(ticket.status).toBe(200)
    expect(ticket.body).toEqual([])
    expect(node.status).toBe(200)
    expect(node.body).toEqual([])
    expect(edge.status).toBe(200)
    expect(edge.body).toEqual([])
    expect(group.status).toBe(200)
    expect(group.body).toEqual([])
    expect(status.status).toBe(200)
    expect(status.body).toMatchObject({ state: 'idle', reason: null })
    expect(setting.status).toBe(200)
    expect(setting.body).toMatchObject({ maxWorkers: 10, autoMerge: false })
    expect(await commands.getDshErrors()).toEqual([])
  })

  it('persists a safe settings change through real services and rejects invalid input without changing it', async () => {
    const saved = await commands.supermeshRequest('/api/supermesh/setting', 'PATCH', { maxWorkers: 3 })
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ maxWorkers: 3, autoMerge: false })
    const invalid = await commands.supermeshRequest('/api/supermesh/setting', 'PATCH', { maxWorkers: 0 })
    expect(invalid.status).toBe(400)
    expect(invalid.body).toMatchObject({ message: 'invalid_config' })
    const setting = await commands.supermeshRequest('/api/supermesh/setting', 'GET')
    expect(setting.status).toBe(200)
    expect(setting.body).toMatchObject({ maxWorkers: 3, autoMerge: false })
  })
})
