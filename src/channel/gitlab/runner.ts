import type { GitLabRequest, GitLabRunner } from '@/channel/gitlab/types'
import process from 'node:process'
import { createRouteDispatcher } from '@deepseek-ai/dsh-http-proxy'
import { fetch } from 'undici'
import { ChannelError } from '@/channel/_shared/error'
import { channelProxyEnvironment } from '@/channel/_shared/proxy'
import { channel } from '@/service/channel'

export class GitLabError extends ChannelError {}

export class FetchGitLabRunner implements GitLabRunner {
  async request(request: GitLabRequest): Promise<unknown> {
    if (request.signal?.aborted)
      throw new GitLabError('interrupted')
    const configured = await channel.connection('gitlab')
    if (!configured?.enabled)
      throw new GitLabError('channel_disabled')
    const site = gitlabSite(configured.host)
    if (request.site !== site || !/^(?:user$|projects(?:\/|$))/.test(request.path) || request.path.includes('\\') || request.path.includes('#') || /[\r\n]/.test(request.path))
      throw new GitLabError('scope_denied')
    const url = new URL(`${site}/api/v4/${request.path}`)
    if (url.origin !== site || !url.pathname.startsWith('/api/v4/'))
      throw new GitLabError('scope_denied')
    const token = configured.token
    if (!token?.trim())
      throw new GitLabError('not_logged_in')
    if (request.signal?.aborted)
      throw new GitLabError('interrupted')
    const env = await channelProxyEnvironment(url, process.env)
    const dispatcher = await createRouteDispatcher({ get: name => env[name] === undefined ? undefined : { value: env[name] } }, { allowH2: false })
    try {
      let response: Awaited<ReturnType<typeof fetch>>
      try {
        response = await fetch(url.href, {
          dispatcher,
          method: request.method,
          // GitLab 11.3.5（2018）只接受 PRIVATE-TOKEN；Bearer 在部分自建实例上被拒。
          headers: { 'private-token': token, 'accept': 'application/json', ...(request.body ? { 'content-type': 'application/json' } : {}), ...request.headers },
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          redirect: 'follow',
          signal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
        })
      }
      catch (error) {
        const cause = (error as { cause?: { message?: string, code?: string } }).cause
        const detail = [error instanceof Error ? error.message : String(error), cause?.message, cause?.code].filter(Boolean).join(' / ')
        throw new GitLabError(request.signal?.aborted ? 'interrupted' : `transport_unknown: ${detail.slice(0, 200)}`)
      }
      if (response.status === 304) {
        await response.body?.cancel()
        return { body: null, etag: response.headers.get('etag') ?? null, notModified: true }
      }
      if (!response.ok) {
        await response.body?.cancel()
        const retry = response.headers.get('retry-after')
        const retryAfter = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000)) : undefined
        throw new GitLabError(response.status === 401 ? 'not_logged_in' : response.status === 429 ? 'rate_limited' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : response.status >= 400 && response.status < 500 ? 'remote_rejected' : 'transport_unknown', Number.isFinite(retryAfter) ? retryAfter : undefined)
      }
      let body: unknown
      try {
        body = await response.json()
      }
      catch {
        throw new GitLabError('invalid_response')
      }
      // 只有需要条件请求的调用方才付这份拷贝成本。
      return request.withEtag ? { body, etag: response.headers.get('etag') ?? null } : body
    }
    finally {
      await dispatcher.close()
    }
  }
}

export function gitlabSite(host: string | null): string {
  let url: URL
  try {
    url = new URL(host ?? 'https://gitlab.com')
  }
  catch { throw new GitLabError('invalid_channel_host') }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new GitLabError('invalid_channel_host')
  return url.origin
}
