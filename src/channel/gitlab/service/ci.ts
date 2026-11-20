import type { CiRemote } from '@/channel/gitlab/service/ci.types'
import { notifyBranchCi } from '@/channel/_shared/ci'
import { array, digest, record, text } from '@/channel/_shared/primitives'
import { resource } from '@/channel/gitlab/service/resource'
import { defineService } from '@/utils/service'

export const ci = defineService({
  async branch(remote: CiRemote, projectId: string, branch: string, signal?: AbortSignal): Promise<void> {
    const project = await remote.project(projectId)
    const site = await remote.site()
    const target = resource.remote(project.remoteUrl, site)
    if (!target)
      return
    const path = `projects/${encodeURIComponent(target.repository)}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1`
    const rows = array(await remote.request(site, path, signal)).map(record)
    const latest = rows[0]
    if (!latest)
      return
    const state = text(latest.status)
    const head = text(latest.sha)
    await notifyBranchCi({
      channel: 'gitlab',
      projectId,
      ref: `${target.repository}:branch:${branch}`,
      fingerprint: digest({ state, head }),
      head,
      title: `CI ${branch}`,
      message: `${branch} CI ${state}`,
      url: text(latest.web_url),
      silent: ['success', 'skipped', 'manual'].includes(state),
    })
  },
  async activeBranches(remote: CiRemote, site: string, repository: string, signal?: AbortSignal): Promise<string[]> {
    const path = `projects/${encodeURIComponent(repository)}/merge_requests?state=opened&per_page=100`
    const rows = array(await remote.request(site, path, signal)).map(record)
    return [...new Set(rows.map(row => text(row.source_branch)).filter(Boolean))]
  },
  async defaultBranch(remote: CiRemote, site: string, repository: string, signal?: AbortSignal): Promise<string | null> {
    const row = record(await remote.request(site, `projects/${encodeURIComponent(repository)}`, signal))
    const branch = typeof row.default_branch === 'string' ? row.default_branch.trim() : ''
    return branch || null
  },
})
