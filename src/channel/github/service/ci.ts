import type { CiSnapshot, RemotePort } from '@/channel/github/service/ci.types'
import { notifyBranchCi } from '@/channel/_shared/ci'
import { array, digest, identity, number, record, text, timestamp } from '@/channel/_shared/primitives'
import { GhError } from '@/channel/github/runner'
import { resource } from '@/channel/github/service/resource'
import { courier } from '@/service/courier'
import { defineService } from '@/utils/service'

export const ci = defineService({
  async snapshot(remote: RemotePort, root: string, head: string, signal?: AbortSignal): Promise<CiSnapshot> {
    const previous = await courier.state<CiSnapshot>('github', root.slice(6), `ci_runs:${head}`)
    const checks = new Map<string, Record<string, unknown>>()
    const statuses = new Map<string, Record<string, unknown>>()
    const acceptCheck = (check: Record<string, unknown>): void => {
      if (check.head_sha !== head)
        return
      const key = `${identity(record(check.app).id)}:${text(check.name)}`
      const prior = checks.get(key)
      if (!prior || number(check.id) > number(prior.id) || (check.id === prior.id && !(prior.status === 'completed' && check.status !== 'completed') && timestamp(check.completed_at ?? check.started_at ?? check.created_at) >= timestamp(prior.completed_at ?? prior.started_at ?? prior.created_at)))
        checks.set(key, check)
    }
    const acceptStatus = (status: Record<string, unknown>): void => {
      const key = text(status.context)
      const prior = statuses.get(key)
      if (!prior || timestamp(status.updated_at ?? status.created_at) > timestamp(prior.updated_at ?? prior.created_at) || (timestamp(status.updated_at ?? status.created_at) === timestamp(prior.updated_at ?? prior.created_at) && number(status.id) > number(prior.id)))
        statuses.set(key, status)
    }
    for (const check of previous?.checks ?? [])
      acceptCheck(check)
    for (const status of previous?.statuses ?? [])
      acceptStatus(status)
    for (const kind of ['check-runs', 'status'] as const) {
      for (let page = 1; ; page++) {
        const response = record(await remote.request(`${root}/commits/${encodeURIComponent(head)}/${kind}?per_page=100&page=${page}`, signal))
        if (kind === 'status' && response.sha !== head)
          throw new GhError('ci_head_mismatch')
        const rows = array(response[kind === 'check-runs' ? 'check_runs' : 'statuses']).map(record)
        for (const row of rows)
          (kind === 'check-runs' ? acceptCheck : acceptStatus)(row)
        if (rows.length < 100)
          break
      }
    }
    const states = [...checks.values()].map(check => check.status === 'in_progress' ? 'running' : check.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(String(check.conclusion)) ? 'passing' : 'failing')
    states.push(...[...statuses.values()].map(status => status.state === 'success' ? 'passing' : status.state === 'pending' ? 'pending' : 'failing'))
    const state = states.includes('failing') ? 'failing' : states.includes('running') ? 'running' : !states.length || states.includes('pending') ? 'pending' : 'passing'
    const result: CiSnapshot = { state, checks: [...checks.values()], statuses: [...statuses.values()] }
    await courier.record('github', root.slice(6), `ci_runs:${head}`, result)
    return result
  },
  async branch(remote: RemotePort, projectId: string, branch: string, signal?: AbortSignal): Promise<void> {
    const project = await remote.project(projectId)
    await remote.probe(projectId, signal)
    const repository = resource.of(project.remoteUrl)!
    const commit = record(await remote.request(`repos/${repository}/commits/${encodeURIComponent(branch)}`, signal))
    const head = text(commit.sha)
    const snapshot = await ci.snapshot(remote, `repos/${repository}`, head, signal)
    const failing = snapshot.checks.filter(check => check.status === 'completed' && !['success', 'neutral', 'skipped'].includes(String(check.conclusion))).map(check => text(check.name))
    failing.push(...snapshot.statuses.filter(status => !['success', 'pending'].includes(String(status.state))).map(status => text(status.context)))
    await notifyBranchCi({
      channel: 'github',
      projectId,
      ref: `${repository}:branch:${branch}`,
      fingerprint: digest({ state: snapshot.state, failing: failing.sort() }),
      head,
      title: `CI ${branch}`,
      message: `${branch} CI ${snapshot.state}${failing.length ? `: ${failing.join(', ')}` : ''}`,
      url: `https://github.com/${repository}/commit/${head}`,
      silent: !failing.length,
    })
  },
})
