/// <reference types="node" />
import type { H3Event } from 'h3'
import { defineWebServer } from 'dsh-h3'
import { getServerOptions } from 'dsh-h3/utils'
import { defineHandler, HTTPError } from 'h3'
import { postAnswer } from './routes/ask.answers.post'
import { getChannelAuthentication } from './routes/channel.authentication.get'
import { postChannelAuthentication } from './routes/channel.authentication.post'
import { putChannelConfiguration } from './routes/channel.configuration'
import { deleteChannelCredentials } from './routes/channel.credentials.delete'
import { getPanel } from './routes/panel.get'
import { postProjectOpening } from './routes/project.opening'
import { patchProject } from './routes/project.patch'
import { postProjects } from './routes/project.post'
import { putProjectSession } from './routes/project.session'
import { getContext } from './routes/session.context.get'
import { getMailbox } from './routes/session.mailbox.get'
import { patchMail } from './routes/session.mailbox.patch'
import { putMainSession } from './routes/session.open.post'
import { patchSettings } from './routes/setting.patch'
import { getTicket } from './routes/ticket.get'
import { patchTicket } from './routes/ticket.patch'

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
  app.patch('/api/nexus/tickets/:id', patchTicket)
  app.put('/api/nexus/channels/:id/configuration', putChannelConfiguration)
  app.delete('/api/nexus/channels/:id/credentials', deleteChannelCredentials)
  app.post('/api/nexus/channels/:id/authentications', postChannelAuthentication)
  app.get('/api/nexus/channels/:id/authentications/:authenticationId', getChannelAuthentication)
  app.patch('/api/nexus/projects/:id', patchProject)
  app.post('/api/nexus/projects', postProjects)
  app.put('/api/nexus/projects/:id/session', putProjectSession)
  app.post('/api/nexus/projects/:id/openings', postProjectOpening)
  app.put('/api/nexus/sessions/main', putMainSession)
  app.patch('/api/nexus/settings', patchSettings)
  app.post('/api/nexus/asks/:id/answers', postAnswer)
  app.get('/api/nexus/sessions/:id/context', getContext)
  app.get('/api/nexus/sessions/:id/mailbox', getMailbox)
  app.patch('/api/nexus/sessions/:id/mailbox/:messageId', patchMail)
})
