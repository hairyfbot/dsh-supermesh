/// <reference types="node" />
import type { H3Event } from 'h3'
import { defineWebServer } from 'dsh-h3'
import { getServerOptions } from 'dsh-h3/utils'
import { defineHandler, HTTPError } from 'h3'
import agentModelCatalogGet from '@/server/routes/agent.model.catalog.get'
import agentModelGet from '@/server/routes/agent.model.get'
import agentModelPatch from '@/server/routes/agent.model.patch'
import askAnswerPost from '@/server/routes/ask.[id].answer.post'
import channelAuthenticationGet from '@/server/routes/channel.[id].authentication.[authenticationId].get'
import channelAuthenticationPost from '@/server/routes/channel.[id].authentication.post'
import channelConfigurationPut from '@/server/routes/channel.[id].configuration.put'
import channelCredentialDelete from '@/server/routes/channel.[id].credential.delete'
import channelGet from '@/server/routes/channel.get'
import deliveryGet from '@/server/routes/delivery.get'
import edgeGet from '@/server/routes/edge.get'
import groupGet from '@/server/routes/group.get'
import messageGet from '@/server/routes/message.get'
import nodeGet from '@/server/routes/node.get'
import pendingGet from '@/server/routes/pending.get'
import projectOpeningPost from '@/server/routes/project.[id].opening.post'
import projectPatch from '@/server/routes/project.[id].patch'
import projectSessionPut from '@/server/routes/project.[id].session.put'
import projectGet from '@/server/routes/project.get'
import projectPost from '@/server/routes/project.post'
import repositoryPost from '@/server/routes/project.repository.post'
import scopeGet from '@/server/routes/scope.get'
import sessionContextGet from '@/server/routes/session.[id].context.get'
import sessionMailboxPatch from '@/server/routes/session.[id].mailbox.[messageId].patch'
import sessionMailboxGet from '@/server/routes/session.[id].mailbox.get'
import sessionMainPut from '@/server/routes/session.open.post'
import sessionRoleGet from '@/server/routes/session.role.get'
import settingGet from '@/server/routes/setting.get'
import settingPatch from '@/server/routes/setting.patch'
import statusGet from '@/server/routes/status.get'
import subscriptionGet from '@/server/routes/subscription.get'
import supervisorGet from '@/server/routes/supervisor.get'
import threadGet from '@/server/routes/thread.get'
import ticketGet from '@/server/routes/ticket.[id].get'
import ticketPatch from '@/server/routes/ticket.[id].patch'
import ticketCountGet from '@/server/routes/ticket.count.get'
import ticketCurrentGet from '@/server/routes/ticket.current.get'
import ticketsGet from '@/server/routes/ticket.get'
import topicCountGet from '@/server/routes/topic.count.get'
import topicGet from '@/server/routes/topic.get'
import triggerGet from '@/server/routes/trigger.get'
import workerGet from '@/server/routes/worker.get'

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
  app.get('/api/supermesh/ticket/count', ticketCountGet)
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
  app.get('/api/supermesh/topic/count', topicCountGet)
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
