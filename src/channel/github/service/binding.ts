import type { GitHubChannel } from '@/channel/github/channel'
import type { Resource } from '@/channel/github/service/resource.types'
import type { AnswerPort, CollectPort, DeliveryPort, IngestPort } from '@/service/courier.types'
import { answerLines } from '@/channel/_shared/answers'
import { escapeRegex, identity, now, record, text, timestamp } from '@/channel/_shared/primitives'
import { GhError } from '@/channel/github/runner'
import { ci } from '@/channel/github/service/ci'
import { resource } from '@/channel/github/service/resource'
import { db } from '@/database'
import { setting } from '@/service/setting'
import { defineService } from '@/utils/service'

export const binding = defineService({
  of(channel: GitHubChannel): { delivery: DeliveryPort<Resource>, collector: CollectPort, ingestor: IngestPort, answerer: AnswerPort } {
    const answerer: AnswerPort = {
      channel: 'github',
      admin: async (row) => {
        const author = record(row.user)
        const login = text(author.login)
        const accounts = await db.channelAccount.findByChannel('github')
        if (author.type !== 'User' || login.endsWith('[bot]') || accounts.some(account => account.role === 'bot' && account.name.toLowerCase() === login.toLowerCase()))
          return false
        return (await setting.load()).administrators.some(name => name.toLowerCase() === login.toLowerCase())
      },
      parse: async (body, thread) => {
        const answers = new Map<string, string>()
        const conflicts = new Set<string>()
        // 不带编号的回答：同话题只有一条待答问题时用它作答。
        let anonymous: string | undefined
        for (const line of answerLines(body)) {
          if (!/^answer(?:[ \t:：]|$)/i.test(line))
            continue
          const content = line.slice(6).trim().replace(/^[:：]\s*/, '').trim()
          if (!content)
            continue
          // `answer <id>: 内容` 才按编号归属；否则整行就是回答。
          const separator = content.indexOf(': ')
          const candidate = separator > 0 ? content.slice(0, separator).trim() : ''
          if (candidate && /^[0-9a-f][\w:-]{7,}$/i.test(candidate) && content.slice(separator + 2).trim()) {
            const answer = content.slice(separator + 2).trim()
            if (answers.has(candidate) && answers.get(candidate) !== answer)
              conflicts.add(candidate)
            answers.set(candidate, answer)
            continue
          }
          anonymous ??= content
        }
        // 无编号回答绑定到本话题唯一待答的 ask；多于一条则不猜。
        if (anonymous !== undefined) {
          const pending = (await db.inbox.listPendingAsk()).filter(ask => ask.type === 'user')
          const scoped = pending.filter(ask => ask.threadId === thread.id)
          const only = scoped.length === 1 ? scoped[0] : (scoped.length === 0 && pending.length === 1 ? pending[0] : undefined)
          if (only)
            answers.set(only.id, anonymous)
        }
        return { answers, conflicts }
      },
      scope: async thread => resource.parse(thread.url!).repository,
    }
    const ingestor: IngestPort = {
      channel: 'github',
      bots: async () => (await db.channelAccount.findByChannel('github')).filter(account => account.role === 'bot'),
      actor: row => text(record(row.user).login),
      human: (row, bots) => {
        const author = record(row.user)
        const name = text(author.login)
        return author.type !== 'Bot' && !name.endsWith('[bot]') && !bots.some(bot => bot.name.toLowerCase() === name.toLowerCase())
      },
      body: row => typeof row.body === 'string' ? row.body : typeof row.state === 'string' ? row.state : '',
      url: row => text(row.html_url),
      ref: row => row.head ? text(record(row.head).ref) : null,
      at: row => timestamp(row.updated_at ?? row.submitted_at ?? row.created_at),
      createdAt: row => timestamp(row.created_at ?? row.submitted_at),
      mentioned: (body, bots) => bots.some(bot => new RegExp(`@${escapeRegex(bot.name)}(?![a-z0-9-])`, 'i').test(body)),
      // 票停在 review（Worker 已报 ready）时，PR 上又来新的真人意见，必须重新派工，
      // 否则意见进了收件箱却没有 Worker 去改，PR 永远停在旧提交（flow.md 8.2）。
      onSubscribedTicket: async (ticket) => {
        if (ticket.status !== 'review' || ticket.paused)
          return
        await db.ticket.update(ticket.id, { status: 'waiting', updatedAt: now() })
        await db.worker.queue(ticket.id, ticket.projectId).catch(() => undefined)
      },
    }
    const delivery: DeliveryPort<Resource> = {
      channel: 'github',
      detail: false,
      parse: async value => resource.parse(value),
      scope: target => target.repository,
      projectFor: target => channel.projectForRepository(target.repository),
      probe: (projectId, signal) => channel.probe(projectId, signal),
      comments: (target, signal) => channel.pages(`repos/${target.repository}/issues/${target.number}/comments`, signal),
      authorId: row => record(row.user).id != null ? identity(record(row.user).id) : null,
      body: row => typeof row.body === 'string' ? row.body : '',
      post: async (target, body, signal) => record(await channel.request(`repos/${target.repository}/issues/${target.number}/comments`, signal, 'POST', { body })),
      commentUrl: (row, target) => {
        const url = text(row.html_url)
        const remote = resource.parse(url)
        if (remote.repository !== target.repository || remote.number !== target.number)
          throw new GhError('managed_comment_mismatch')
        return url
      },
      askPrompt: row => `${row.message}\n\n回复格式：\`answer: 你的回答\``,
      skipReasons: [],
    }
    const collector: CollectPort = {
      channel: 'github',
      detail: false,
      status: true,
      scope: async project => resource.of(project.remoteUrl),
      project: projectId => channel.project(projectId),
      probe: (projectId, signal) => channel.probe(projectId, signal),
      collect: (context, signal) => channel.collectProject(context, signal),
      collectBranch: (projectId, branch, signal) => ci.branch(channel, projectId, branch, signal),
    }
    return { delivery, collector, ingestor, answerer }
  },
})
