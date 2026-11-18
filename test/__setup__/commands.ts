import type { Page } from 'playwright'
import type { BrowserCommand } from 'vitest/node'
import type { ShellScaffold } from './shell'
import { launchShell, logs } from './shell'

interface BrowserDshSession {
  scaffold: ShellScaffold
  page?: Page
  errors: () => string[]
  previewDismissed?: boolean
}
const sessions = new Map<string, BrowserDshSession>()

export const launchDsh: BrowserCommand<[], { baseUrl: string }> = async (context) => {
  if (context.provider.name !== 'playwright')
    throw new Error('DSH E2E requires the Playwright browser provider')
  const scaffold = await launchShell()
  sessions.set(context.sessionId, { scaffold, errors: () => [] })
  if (scaffold.cookie)
    await context.context.addCookies([scaffold.cookie.cookie])
  return { baseUrl: scaffold.baseUrl }
}

export const openDshPage: BrowserCommand<[], { url: string }> = async (context) => {
  const session = sessions.get(context.sessionId)
  if (!session)
    throw new Error('DSH shell must be launched first')
  await session.page?.close()
  const page = await context.context.newPage()
  session.page = page
  session.errors = logs(page).errors
  await page.goto(session.scaffold.baseUrl, { waitUntil: 'load' })
  await page.getByRole('button', { name: 'Nexus', exact: true }).waitFor({ timeout: 90_000 })
  return { url: page.url() }
}

export const nexusRequest: BrowserCommand<[string, string, unknown?], { status: number, body: unknown }> = async (context, path, method, body) => {
  const page = sessions.get(context.sessionId)?.page
  if (!page)
    throw new Error('DSH page must be opened first')
  if (!path.startsWith('/api/nexus/'))
    throw new Error('E2E only permits Nexus endpoints')
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, { path, method, body })
}

export const openNexusMainSession: BrowserCommand<[], { sessionId: string, panelSessionId: unknown, errors: string[] }> = async (context) => {
  const session = sessions.get(context.sessionId)
  const page = session?.page
  if (!session || !page)
    throw new Error('DSH page must be opened first')
  const preview = page.getByRole('dialog', { name: /^(?:预览版说明|Preview notice)$/iu })
  if (!session.previewDismissed) {
    await preview.getByRole('button', { name: /^(?:继续|Continue)$/u }).click()
    await preview.waitFor({ state: 'hidden' })
    session.previewDismissed = true
  }
  await page.getByRole('button', { name: 'Nexus', exact: true }).click()
  const openMain = page.getByRole('button', { name: /^(?:打开主会话|Open main session)$/u })
  await openMain.waitFor({ state: 'visible' })
  const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/nexus/session/main' && response.request().method() === 'PUT')
  await openMain.click()
  const response = await created
  if (response.status() !== 200)
    throw new Error(`main session creation failed: ${await response.text()}`)
  const result = await response.json() as { sessionId: string }
  const panel = await page.evaluate(async () => {
    const response = await fetch('/api/nexus/session/role')
    if (!response.ok)
      throw new Error('session role lookup failed')
    const value = await response.json() as { sessions: { sessionId: string, role: string }[] }
    return { mainSessionId: value.sessions.find(session => session.role === 'main')?.sessionId ?? null }
  })
  return { sessionId: result.sessionId, panelSessionId: panel.mainSessionId, errors: session.errors() }
}

export const getDshErrors: BrowserCommand<[], string[]> = async (context) => {
  const session = sessions.get(context.sessionId)
  if (!session?.page)
    throw new Error('DSH page must be opened first')
  return session.errors()
}

export const closeDsh: BrowserCommand<[], void> = async (context) => {
  const session = sessions.get(context.sessionId)
  if (!session)
    return
  sessions.delete(context.sessionId)
  try {
    await session.page?.close()
  }
  finally {
    await session.scaffold.close()
  }
}
