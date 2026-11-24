export interface GitRemote {
  host: string
  owner: string
  name: string
  remoteUrl: string
  webUrl: string
}

export function parseGitRemote(value: string, site?: string): GitRemote {
  const invalid = () => new Error('invalid_repository_remote')
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\s\\%]/.test(value))
    throw invalid()
  const scp = /^git@([^/:]+):(.+)$/.exec(value)
  let url: URL
  try {
    url = new URL(scp ? `ssh://git@${scp[1]}/${scp[2]}` : value)
  }
  catch { throw invalid() }
  // 自建 GitLab 常只监听 80 端口，纯 HTTP 远程要认；GitHub 没有纯 HTTP 服务，仍只收默认端口的 https。
  if (!['http:', 'https:', 'ssh:'].includes(url.protocol) || !url.hostname || url.password || url.search || url.hash)
    throw invalid()
  if (url.protocol === 'ssh:' ? url.username !== 'git' || Boolean(url.port) : Boolean(url.username) || (url.hostname === 'github.com' && (url.protocol !== 'https:' || Boolean(url.port))))
    throw invalid()
  const rawPath = scp ? scp[2]! : value.slice(value.indexOf('://') + 3).replace(/^[^/]+\//, '')
  const segments = rawPath.replace(/\/$/, '').replace(/\.git$/, '').split('/')
  if (segments.length < 2 || !segments.every(segment => /^\w[\w.-]*$/.test(segment) && !segment.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)))
    throw invalid()
  const owner = segments.slice(0, -1).join('/')
  const name = segments.at(-1)!
  const webUrl = `${webProtocol(site, url.host, url.protocol)}//${url.host}/${segments.join('/')}`
  return { host: url.host, owner, name, remoteUrl: url.protocol === 'ssh:' ? `git@${url.hostname}:${segments.join('/')}.git` : `${webUrl}.git`, webUrl }
}

/** ssh 远端没有网页协议，按渠道配置的站点协议归一；站点不是同一台主机时退回 https。 */
function webProtocol(site: string | undefined, host: string, protocol: string): string {
  if (protocol !== 'ssh:' || !site)
    return protocol
  try {
    const configured = new URL(site)
    return configured.host === host && configured.protocol === 'http:' ? 'http:' : 'https:'
  }
  catch { return 'https:' }
}

/**
 * 归一化仓库路径：git remote 与 issue / PR 网页地址都归到 `owner/repo`（小写）。
 * 话题 refId、项目 remoteUrl 和邮件里的 repository 用同一种形式，匹配不再受大小写影响。
 */
export function repositoryOf(value: string | null): string | null {
  if (!value)
    return null
  const scp = /^git@[^/:]+:(.+)$/.exec(value)
  let path: string
  if (scp) {
    path = scp[1]!
  }
  else {
    try {
      path = new URL(value).pathname
    }
    catch {
      return null
    }
  }
  const topic = /^\/(.+?)\/(?:-\/)?(?:issues|pull|merge_requests|work_items)\/[1-9]\d*\/?$/.exec(path)
  const repository = (topic ? topic[1]! : path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '')).toLowerCase()
  return repository || null
}

export function parseRepositoryRemote(value: string, gitlabHost = 'https://gitlab.com'): GitRemote & {
  platform: 'github' | 'gitlab'
  defaultName: string
} {
  const invalid = () => new Error('invalid_repository_remote')
  let configured: URL
  try {
    configured = new URL(gitlabHost)
  }
  catch { throw invalid() }
  if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash)
    throw invalid()
  const remote = parseGitRemote(value, gitlabHost)
  const platform = remote.host === 'github.com' ? 'github' : remote.host === configured.host ? 'gitlab' : null
  if (!platform || (platform === 'github' && remote.owner.includes('/')))
    throw invalid()
  return { ...remote, platform, defaultName: `${platform}/${remote.name}` }
}
