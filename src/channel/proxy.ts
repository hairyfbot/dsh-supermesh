import { execFile } from 'node:child_process'
import process from 'node:process'
import { proxyEnvironmentForChild } from '@deepseek-ai/dsh-http-proxy'

export async function channelProxyEnvironment(url: URL, inherited: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  const env = { ...inherited }
  const overlay = proxyEnvironmentForChild()
  const explicit = Object.entries(inherited).some(([name, value]) => /^(?:https?|all)_proxy$/i.test(name) && Boolean(value?.trim()))
  for (const [name, value] of Object.entries(overlay)) {
    if (value === undefined)
      delete env[name]
    else
      env[name] = value
  }
  if (process.platform !== 'win32' || explicit || Object.keys(overlay).length)
    return env
  const settings = await new Promise<string>((resolve) => {
    execFile('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { windowsHide: true, timeout: 3000, maxBuffer: 65536 }, (error, stdout) => resolve(error ? '' : stdout))
  })
  if (!/^\s*ProxyEnable\s+REG_DWORD\s+0x0*1\s*$/im.test(settings))
    return env
  const bypass = /^\s*ProxyOverride\s+REG_SZ\s+(\S.*)$/im.exec(settings)?.[1].trim()
  if (bypass?.split(';').some(pattern => bypasses(url.hostname, pattern.trim())))
    return env
  const raw = /^\s*ProxyServer\s+REG_SZ\s+(\S.*)$/im.exec(settings)?.[1].trim()
  if (!raw)
    return env
  const selected = raw.includes('=') ? raw.split(';').map(part => part.trim()).find(part => part.toLowerCase().startsWith(`${url.protocol.slice(0, -1)}=`))?.slice(url.protocol.length) : raw
  if (!selected)
    return env
  try {
    const proxy = new URL(selected.includes('://') ? selected : `http://${selected}`)
    if (!['http:', 'https:'].includes(proxy.protocol) || !proxy.hostname || proxy.pathname !== '/' || proxy.search || proxy.hash)
      return env
    // Go CLIs ignore the enabled Windows system proxy, causing device authorization timeouts.
    env.HTTP_PROXY = proxy.href
    env.HTTPS_PROXY = proxy.href
    delete env.http_proxy
    delete env.https_proxy
  }
  catch {}
  return env
}

function bypasses(hostname: string, pattern: string): boolean {
  if (!pattern)
    return false
  if (pattern.toLowerCase() === '<local>')
    return !hostname.includes('.') && !hostname.includes(':')
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`, 'i').test(hostname)
}
