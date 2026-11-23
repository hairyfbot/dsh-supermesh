import { gitlabSite } from '@/channel/gitlab/runner'
import { db } from '@/database'
import { defineService } from '@/utils/service'

const STATE = 'web_hosts'
let stored: { site: string, hosts: string[] } | null = null
let loading: Promise<void> | undefined

/**
 * 自建 GitLab 常把 API 放在 IP、`external_url` 用域名，API 返回的 `web_url` 因此与配置的站点不同源。
 * 这里保存从已认证 API 学到的网页 host，让同一实例的两种形态都能解析。
 */
export const hosts = defineService({
  ready(): Promise<void> {
    loading ??= load()
    return loading
  },
  allowed(site: string): string[] {
    const configured = new URL(gitlabSite(site))
    const aliases = stored?.site === configured.origin ? stored.hosts : []
    return [...new Set([configured.host, ...aliases])]
  },
  async learn(site: string, webUrl: string): Promise<void> {
    const configured = new URL(gitlabSite(site))
    let host: string
    try {
      host = new URL(webUrl).host
    }
    catch { return }
    const aliases = stored?.site === configured.origin ? stored.hosts : []
    if (!host || host === configured.host || aliases.includes(host))
      return
    const next = { site: configured.origin, hosts: [...aliases, host] }
    stored = next
    await db.sourceState.set('gitlab', STATE, JSON.stringify(next), new Date().toISOString())
  },
})

async function load(): Promise<void> {
  const row = await db.sourceState.find('gitlab', STATE)
  if (!row)
    return
  try {
    const value: unknown = JSON.parse(row.value)
    if (value && typeof value === 'object' && !Array.isArray(value) && 'site' in value && 'hosts' in value && typeof value.site === 'string' && Array.isArray(value.hosts))
      stored = { site: value.site, hosts: value.hosts.filter((host): host is string => typeof host === 'string') }
  }
  catch {
    // 学到的别名只是缓存，坏了就重新学，不能因此让整个渠道不可用。
  }
}
