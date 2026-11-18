/// <reference types="node" />
import type { H3Event } from 'h3'
import { defineWebServer } from 'dsh-h3'
import { getServerOptions } from 'dsh-h3/utils'
import { defineHandler, HTTPError } from 'h3'
import agentModelCatalogGet from './routes/agent.model.catalog.get'
import agentModelGet from './routes/agent.model.get'
import agentModelPatch from './routes/agent.model.patch'
import askAnswerPost from './routes/ask.[id].answer.post'
import channelAuthenticationGet from './routes/channel.[id].authentication.[authenticationId].get'
import channelAuthenticationPost from './routes/channel.[id].authentication.post'
import channelConfigurationPut from './routes/channel.[id].configuration.put'
import channelCredentialDelete from './routes/channel.[id].credential.delete'
import channelGet from './routes/channel.get'
import deliveryGet from './routes/delivery.get'
import edgeGet from './routes/edge.get'
import groupGet from './routes/group.get'
import messageGet from './routes/message.get'
import nodeGet from './routes/node.get'
import pendingGet from './routes/pending.get'
import projectOpeningPost from './routes/project.[id].opening.post'
import projectPatch from './routes/project.[id].patch'
import projectSessionPut from './routes/project.[id].session.put'
import projectGet from './routes/project.get'
import projectPost from './routes/project.post'
import repositoryPost from './routes/project.repository.post'
import scopeGet from './routes/scope.get'
import sessionContextGet from './routes/session.[id].context.get'
import sessionMailboxPatch from './routes/session.[id].mailbox.[messageId].patch'
import sessionMailboxGet from './routes/session.[id].mailbox.get'
import sessionMainPut from './routes/session.open.post'
import sessionRoleGet from './routes/session.role.get'
import settingGet from './routes/setting.get'
import settingPatch from './routes/setting.patch'
import statusGet from './routes/status.get'
import subscriptionGet from './routes/subscription.get'
import supervisorGet from './routes/supervisor.get'
import threadGet from './routes/thread.get'
import ticketGet from './routes/ticket.[id].get'
import ticketPatch from './routes/ticket.[id].patch'
import ticketCurrentGet from './routes/ticket.current.get'
import ticketsGet from './routes/ticket.get'
import topicGet from './routes/topic.get'
import triggerGet from './routes/trigger.get'
import workerGet from './routes/worker.get'

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

  app.get('/api/supermesh/project', projectGet)
  app.post('/api/supermesh/project', projectPost)
  app.patch('/api/supermesh/project/:id', projectPatch)
  app.put('/api/supermesh/project/:id/session', projectSessionPut)
  app.post('/api/supermesh/project/:id/opening', projectOpeningPost)
  app.post('/api/supermesh/repository', repositoryPost)

  app.get('/api/supermesh/ticket', ticketsGet)
  app.get('/api/supermesh/ticket/current', ticketCurrentGet)
  app.get('/api/supermesh/ticket/:id', ticketGet)
  app.patch('/api/supermesh/ticket/:id', ticketPatch)
  app.post('/api/supermesh/ask/:id/answer', askAnswerPost)

  app.get('/api/supermesh/worker', workerGet)
  app.get('/api/supermesh/supervisor', supervisorGet)
  app.get('/api/supermesh/scope', scopeGet)
  app.get('/api/supermesh/node', nodeGet)
  app.get('/api/supermesh/edge', edgeGet)
  app.get('/api/supermesh/group', groupGet)
  app.get('/api/supermesh/status', statusGet)
  app.get('/api/supermesh/message', messageGet)
  app.get('/api/supermesh/pending', pendingGet)
  app.get('/api/supermesh/delivery', deliveryGet)
  app.get('/api/supermesh/thread', threadGet)
  app.get('/api/supermesh/trigger', triggerGet)
  app.get('/api/supermesh/topic', topicGet)
  app.get('/api/supermesh/subscription', subscriptionGet)

  app.get('/api/supermesh/channel', channelGet)
  app.put('/api/supermesh/channel/:id/configuration', channelConfigurationPut)
  app.delete('/api/supermesh/channel/:id/credential', channelCredentialDelete)
  app.post('/api/supermesh/channel/:id/authentication', channelAuthenticationPost)
  app.get('/api/supermesh/channel/:id/authentication/:authenticationId', channelAuthenticationGet)

  app.get('/api/supermesh/setting', settingGet)
  app.patch('/api/supermesh/setting', settingPatch)
  app.get('/api/supermesh/agent/model', agentModelGet)
  app.patch('/api/supermesh/agent/model', agentModelPatch)
  app.get('/api/supermesh/agent/model/catalog', agentModelCatalogGet)

  app.put('/api/supermesh/session/main', sessionMainPut)
  app.get('/api/supermesh/session/role', sessionRoleGet)
  app.get('/api/supermesh/session/:id/context', sessionContextGet)
  app.get('/api/supermesh/session/:id/mailbox', sessionMailboxGet)
  app.patch('/api/supermesh/session/:id/mailbox/:messageId', sessionMailboxPatch)
})
