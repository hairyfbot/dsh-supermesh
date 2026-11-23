import type { GitLabChannel } from '@/channel/gitlab/channel'
import type { Resource } from '@/channel/gitlab/service/resource.types'
import type { AnswerPort, CollectPort, DeliveryPort, IngestPort } from '@/service/courier.types'
import { escapeRegex, identity, record, text, timestamp } from '@/channel/_shared/primitives'
import { ci } from '@/channel/gitlab/service/ci'
import { resource } from '@/channel/gitlab/service/resource'
import { db } from '@/database'
import { setting } from '@/service/setting'
import { defineService } from '@/utils/service'

export const binding = defineService({
  of(channel: GitLabChannel): { collect: CollectPort, delivery: DeliveryPort<Resource>, ingest: IngestPort, answer: AnswerPort } {
    return { collect: collectPort(channel), delivery: deliveryPort(channel), ingest: ingestPort(), answer: answerPort(channel) }
  },
})

function collectPort(channel: GitLabChannel): CollectPort {
  return {
    channel: 'gitlab',
    detail: true,
    status: true,
    scope: project => channel.scopeOf(project),
    project: projectId => channel.project(projectId),
    probe: (projectId, signal) => channel.probe(projectId, signal),
    collect: (context, signal) => channel.collectProject(context, signal),
    collectBranch: (projectId, branch, signal) => ci.branch(channel, projectId, branch, signal),
    onFailure: (project, reason) => console.error(`[gitlab:collect] ${project.name} ${project.remoteUrl} -> ${reason}`),
  }
}

function deliveryPort(channel: GitLabChannel): DeliveryPort<Resource> {
  return {
    channel: 'gitlab',
    detail: true,
    parse: async value => resource.parse(value, await channel.site()),
    scope: target => resource.source(target),
    projectFor: target => channel.projectForRepository(resource.source(target)),
    probe: (projectId, signal) => channel.probe(projectId, signal),
    comments: async (target, signal) => (await channel.pages(target.site, `${resource.apiRoot(target)}/notes`, signal)).rows,
    authorId: (row) => {
      const author = record(row.author)
      return author.id != null ? identity(author.id) : null
    },
    body: row => typeof row.body === 'string' ? row.body : '',
    post: async (target, body, signal) => record(await channel.request(target.site, `${resource.apiRoot(target)}/notes`, signal, 'POST', { body })),
    commentUrl: (row, target) => {
      resource.validateNote(row, target)
      return `${resource.url(target)}#note_${identity(row.id)}`
    },
    askPrompt: row => `${row.message}\n\n问题编号：${row.id}\n请回复：answer ${row.id}: 你的回答`,
    skipReasons: ['project_unavailable'],
  }
}

function ingestPort(): IngestPort {
  return {
    channel: 'gitlab',
    bots: async () => (await db.channelAccount.findByChannel('gitlab')).filter(account => account.role === 'bot'),
    actor: row => text(record(row.author).username),
    human: (row, bots) => {
      const author = record(row.author)
      const login = text(author.username)
      return author.bot !== true && row.system !== true && !bots.some(bot => bot.name.toLowerCase() === login.toLowerCase())
    },
    body: row => typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : typeof row.state === 'string' ? row.state : '',
    url: (row, sourceKind, thread) => sourceKind === 'note' ? `${thread.url}#note_${identity(row.id)}` : text(row.web_url),
    ref: row => typeof row.source_branch === 'string' ? row.source_branch : null,
    at: row => timestamp(row.updated_at ?? row.created_at),
    createdAt: row => timestamp(row.created_at),
    mentioned: (body, bots) => bots.some(bot => new RegExp(`(?:^|[^a-z0-9_@])@${escapeRegex(bot.name)}(?![a-z0-9_.-])`, 'i').test(body)),
  }
}

function answerPort(channel: GitLabChannel): AnswerPort {
  return {
    channel: 'gitlab',
    admin: async (row) => {
      const author = record(row.author)
      const login = text(author.username)
      const accounts = await db.channelAccount.findByChannel('gitlab')
      if (author.bot === true || row.system === true || accounts.some(account => account.role === 'bot' && account.name.toLowerCase() === login.toLowerCase()))
        return false
      return (await setting.load()).administrators.some(name => name.toLowerCase() === login.toLowerCase())
    },
    parse: async body => resource.answers(body),
    scope: async thread => resource.source(resource.parse(thread.url!, await channel.site())),
  }
}
