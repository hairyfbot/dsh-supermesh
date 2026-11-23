import type { ChannelItem, ChannelRow } from '@/channel/_shared/types'
import type { Resource } from '@/channel/gitlab/service/resource.types'
import { answerLines } from '@/channel/_shared/answers'
import { identity, number, record, text, timestamp } from '@/channel/_shared/primitives'
import { GitLabError, gitlabSite } from '@/channel/gitlab/runner'
import { hosts } from '@/channel/gitlab/service/hosts'
import { defineService } from '@/utils/service'

export const resource = defineService({
  remote(remoteUrl: string | null, host: string): { site: string, repository: string } | null {
    if (!remoteUrl)
      return null
    const site = gitlabSite(host)
    const allowed = hosts.allowed(site)
    const scp = /^git@([^/:]+):(.+)$/.exec(remoteUrl)
    if (scp) {
      if (!allowed.some(entry => hostnameOf(entry) === scp[1]!.toLowerCase()))
        return null
      const repository = resource.path(scp[2]!.replace(/\.git$/, ''))
      return repository ? { site, repository } : null
    }
    try {
      const url = new URL(remoteUrl)
      if (!['http:', 'https:', 'ssh:'].includes(url.protocol) || !allowed.includes(url.host) || url.password || url.search || url.hash)
        return null
      if (url.protocol === 'ssh:' ? url.username !== 'git' : Boolean(url.username))
        return null
      const repository = resource.path(url.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, ''))
      return repository ? { site, repository } : null
    }
    catch { return null }
  },
  path(value: string): string | null {
    const segments = value.split('/')
    return segments.length >= 2 && segments.every(segment => /^\w[\w.-]*$/.test(segment) && segment !== '.' && segment !== '..') ? value : null
  },
  parse(value: string, site: string): Resource {
    const short = /^gitlab:([^:]+):(issue|pull|mr):([1-9]\d*)$/.exec(value)
    if (short) {
      const repository = resource.path(short[1]!)
      const number = Number(short[3])
      if (repository && Number.isSafeInteger(number))
        return { site, repository, kind: short[2] === 'issue' ? 'issue' : 'pull', number }
      throw new GitLabError('invalid_resource')
    }
    let url: URL
    try {
      url = new URL(value.startsWith('gitlab/') ? `${site}/${value.slice(7)}` : value)
    }
    catch { throw new GitLabError('invalid_resource') }
    // 四种实际形态都要认（v11.3.5 的 spec/lib/gitlab/url_builder_spec.rb 断言 issue 与
    // merge_request 的 web_url 都是 /<full_path>/issues|merge_requests/<iid>，没有 `/-/`；
    // 新版本起加上了 `/-/`，issue 再演进成 `/-/work_items/<iid>`）：
    //   /<ns>/<proj>/issues/<iid>            ← 11.3.5
    //   /<ns>/<proj>/merge_requests/<iid>    ← 11.3.5
    //   /<ns>/<proj>/-/issues/<iid>
    //   /<ns>/<proj>/-/work_items/<iid>
    const match = /^\/(.+?)(?:\/-\/(issues|work_items|merge_requests)|\/(issues|merge_requests))\/([1-9]\d*)\/?$/.exec(url.pathname)
    const repository = match && resource.path(match[1]!)
    const number = Number(match?.[4])
    if (!['http:', 'https:'].includes(url.protocol) || !hosts.allowed(site).includes(url.host) || url.username || url.password || url.search || (url.hash && !/^#note_[1-9]\d*$/.test(url.hash)) || !repository || !Number.isSafeInteger(number))
      throw new GitLabError('invalid_resource')
    const kind = (match![2] ?? match![3]) === 'merge_requests' ? 'pull' : 'issue'
    return { site, repository, kind, number }
  },
  source(target: { site: string, repository: string }): string {
    return `${target.site}/${target.repository}`
  },
  url(target: Resource): string {
    // 用 11.3.5 的形态生成（/<ns>/<proj>/issues|merge_requests/<iid>，没有 `/-/`）。
    // 新版 GitLab 会把旧地址 301 到 `/-/...`，所以旧形态对新旧实例都能打开；
    // 反过来把 `/-/` 写到 11.3.5 上是 404。
    return `${resource.source(target)}/${target.kind === 'issue' ? 'issues' : 'merge_requests'}/${target.number}`
  },
  apiRoot(target: Resource): string {
    return `projects/${encodeURIComponent(target.repository)}/${target.kind === 'issue' ? 'issues' : 'merge_requests'}/${target.number}`
  },
  validateTopic(row: ChannelRow, target: Resource): void {
    const remote = resource.parse(text(row.web_url), target.site)
    if (number(row.iid) !== target.number || resource.url(remote) !== resource.url(target))
      throw new GitLabError('source_repository_mismatch')
  },
  validateNote(row: ChannelRow, target: Resource): void {
    identity(row.id)
    if (row.noteable_iid !== undefined && number(row.noteable_iid) !== target.number)
      throw new GitLabError('source_repository_mismatch')
    if (row.noteable_type !== undefined && row.noteable_type !== (target.kind === 'issue' ? 'Issue' : 'MergeRequest'))
      throw new GitLabError('source_repository_mismatch')
    if (row.web_url !== undefined && resource.url(resource.parse(text(row.web_url), target.site)) !== resource.url(target))
      throw new GitLabError('source_repository_mismatch')
  },
  item(row: ChannelRow, kind: ChannelItem['kind'], target: Resource): ChannelItem {
    if (kind === 'comment')
      resource.validateNote(row, target)
    return { id: identity(row.id), kind, actor: text(record(row.author).username), body: typeof row.body === 'string' ? row.body : typeof row.description === 'string' ? row.description : typeof row.state === 'string' ? row.state : '', url: kind === 'comment' ? `${resource.url(target)}#note_${identity(row.id)}` : text(row.web_url), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at ?? row.created_at) }
  },
  answers(body: string): { answers: Map<string, string>, conflicts: Set<string> } {
    const answers = new Map<string, string>()
    const conflicts = new Set<string>()
    for (const line of answerLines(body)) {
      if (!/^answer[ \t]/i.test(line))
        continue
      const content = line.slice(7).trim()
      const separator = content.indexOf(': ')
      if (separator < 1)
        continue
      const id = content.slice(0, separator).trim()
      const answer = content.slice(separator + 2).trim()
      if (!answer || /\s/.test(id))
        continue
      if (answers.has(id) && answers.get(id) !== answer)
        conflicts.add(id)
      answers.set(id, answer)
    }
    return { answers, conflicts }
  },
})

function hostnameOf(host: string): string {
  try {
    return new URL(`http://${host}`).hostname
  }
  catch { return host }
}
