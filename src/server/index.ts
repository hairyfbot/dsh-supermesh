/// <reference types="node" />
import type { H3Event } from 'h3'
import { defineWebServer } from 'dsh-h3'
import { getServerOptions } from 'dsh-h3/utils'
import { defineHandler, HTTPError } from 'h3'
import { postAnswer } from './routes/asks.post'
import { getContext } from './routes/context.get'
import { getMailbox } from './routes/mailbox.get'
import { handleMail } from './routes/mailbox.post'
import { getPanel } from './routes/panel.get'
import { patchProject } from './routes/projects.patch'
import { refreshProjects } from './routes/projects.post'
import { patchSettings } from './routes/settings.patch'
import { getTicket } from './routes/tickets.get'
import { postTicket } from './routes/tickets.post'

export interface ServerOptions {
  owner: (event: H3Event) => boolean | Promise<boolean>
  origin: string
}

export const authorize = defineHandler(async (event) => {
  const options = getServerOptions<ServerOptions>(event)
  event.res.headers.set('cache-control', 'no-store')
  const origin = event.req.headers.get('origin')
  const host = event.req.headers.get('host')
  if ((origin && origin !== options.origin) || (host && host !== new URL(options.origin).host))
    throw new HTTPError({ status: 403, message: 'origin_denied' })
  if (!options.owner || !await options.owner(event))
    throw new HTTPError({ status: 401, message: 'owner_required' })
})

export const server = defineWebServer<ServerOptions>((app) => {
  app.use(authorize)
  app.get('/api/nexus/panel', getPanel)
  app.get('/api/nexus/tickets/:id', getTicket)
  app.post('/api/nexus/tickets/:id/:action', postTicket)
  app.patch('/api/nexus/projects/:id', patchProject)
  app.post('/api/nexus/projects/refresh', refreshProjects)
  app.patch('/api/nexus/settings', patchSettings)
  app.post('/api/nexus/asks/:id/answers', postAnswer)
  app.get('/api/nexus/sessions/:id/context', getContext)
  app.get('/api/nexus/sessions/:id/mailbox', getMailbox)
  app.post('/api/nexus/sessions/:id/mailbox/:messageId/handled', handleMail)
})
