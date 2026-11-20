import type { ChannelItem, ChannelRow } from '@/channel/_shared/types'
import type { Resource } from '@/channel/github/service/resource.types'
import { identity, number, record, text, timestamp } from '@/channel/_shared/primitives'
import { GhError } from '@/channel/github/runner'
import { defineService } from '@/utils/service'

export const resource = defineService({
  of(remoteUrl: string | null): string | null {
    if (!remoteUrl)
      return null
    const ssh = /^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/i.exec(remoteUrl)
    if (ssh)
      return ssh[1]!.toLowerCase()
    try {
      const url = new URL(remoteUrl)
      if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname !== 'github.com' || url.password || url.search || url.hash || url.port)
        return null
      const match = /^\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i.exec(url.pathname)
      return match?.[1]?.toLowerCase() ?? null
    }
    catch { return null }
  },
  /**
   * 仓库改名或转移后，GitHub 对旧全名仍返回 200，只是 full_name 变成新名。
   * 返回新全名，未改名时返回 null；调用方必须跟随，否则采集会在 probe 阶段永久失败。
   */
  renamed(configured: string, fullName: string): string | null {
    const canonical = resource.of(`https://github.com/${fullName}`)
    if (!canonical)
      throw new GhError('invalid_response')
    return canonical === configured ? null : canonical
  },
  parse(value: string): Resource {
    const short = /^github:([^/:]+\/[^/:]+):(issue|pull):([1-9]\d*)$/.exec(value)
    if (short)
      return { repository: short[1]!.toLowerCase(), kind: short[2] as 'issue' | 'pull', number: Number(short[3]) }
    let url: URL
    try {
      url = new URL(value)
    }
    catch { throw new GhError('invalid_resource') }
    const match = /^\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/([1-9]\d*)\/?$/i.exec(url.pathname)
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || !match)
      throw new GhError('invalid_resource')
    return { repository: match[1]!.toLowerCase(), kind: match[2] === 'pull' ? 'pull' : 'issue', number: Number(match[3]) }
  },
  validate(row: ChannelRow, target: Resource): void {
    const url = resource.parse(text(row.html_url))
    if (number(row.number) !== target.number || url.repository !== target.repository || url.kind !== target.kind)
      throw new GhError('source_repository_mismatch')
  },
  item(row: ChannelRow, kind: ChannelItem['kind']): ChannelItem {
    return { id: identity(row.id), kind, actor: text(record(row.user).login), body: typeof row.body === 'string' ? row.body : typeof row.state === 'string' ? row.state : '', url: text(row.html_url), createdAt: timestamp(row.created_at ?? row.submitted_at), updatedAt: timestamp(row.updated_at ?? row.submitted_at ?? row.created_at) }
  },
})
