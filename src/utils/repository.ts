export interface GitRemote {
  host: string
  owner: string
  name: string
  remoteUrl: string
  webUrl: string
}

export function parseGitRemote(value: string): GitRemote {
  const invalid = () => new Error('invalid_repository_remote')
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\s\\%]/.test(value))
    throw invalid()
  const scp = /^git@([^/:]+):(.+)$/.exec(value)
  let url: URL
  try {
    url = new URL(scp ? `ssh://git@${scp[1]}/${scp[2]}` : value)
  }
  catch { throw invalid() }
  if (!['https:', 'ssh:'].includes(url.protocol) || !url.hostname || url.password || url.search || url.hash || (url.protocol === 'https:' ? Boolean(url.username) : url.username !== 'git' || Boolean(url.port)))
    throw invalid()
  const rawPath = scp ? scp[2]! : value.slice(value.indexOf('://') + 3).replace(/^[^/]+\//, '')
  const segments = rawPath.replace(/\/$/, '').replace(/\.git$/, '').split('/')
  if (segments.length < 2 || !segments.every(segment => /^\w[\w.-]*$/.test(segment) && !segment.endsWith('.') && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)))
    throw invalid()
  const owner = segments.slice(0, -1).join('/')
  const name = segments.at(-1)!
  const webUrl = `https://${url.host}/${segments.join('/')}`
  return { host: url.host, owner, name, remoteUrl: url.protocol === 'https:' ? `${webUrl}.git` : `git@${url.hostname}:${segments.join('/')}.git`, webUrl }
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
  if (configured.protocol !== 'https:' || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash)
    throw invalid()
  const remote = parseGitRemote(value)
  const platform = remote.host === 'github.com' ? 'github' : remote.host === configured.host ? 'gitlab' : null
  if (!platform || (platform === 'github' && remote.owner.includes('/')))
    throw invalid()
  return { ...remote, platform, defaultName: `${platform}/${remote.name}` }
}
