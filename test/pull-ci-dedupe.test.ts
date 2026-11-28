import type { Selectable } from 'kysely'
import type { RemotePort } from '@/channel/github/service/ci.types'
import type { DB } from '@/database/types'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { pull } from '@/channel/github/service/pull'
import { db } from '@/database'

const suffix = randomUUID().slice(0, 8)
const repository = `owner/pull-${suffix}`
const projectId = `pull-project-${suffix}`
const ticketId = `T-pull-${suffix}`
const threadId = `github:${repository}:7`
const prUrl = `https://github.com/${repository}/pull/7`
const head = 'cf85275ad410509c3177a2fbb0d44f15e9aac067'
const at = '2026-11-26T10:00:00.000Z'

let project: Selectable<DB['project']>
let conclusion: 'success' | 'failure' = 'success'

const remote: RemotePort = {
  project: async () => project,
  probe: async () => ({ providerId: '1', login: 'hairyfbot', repositoryId: '2', defaultBranch: 'main' }),
  request: async (path) => {
    if (path === `repos/${repository}/pulls/7`)
      return { number: 7, state: 'open', merged: false, updated_at: '2026-11-26T10:11:14.000Z', html_url: prUrl, title: 'PR 7', head: { sha: head }, base: { ref: 'main', repo: { full_name: repository } } }
    if (path.includes('/check-runs'))
      return { check_runs: [{ id: 1, head_sha: head, name: 'Unit Tests', status: 'completed', conclusion, completed_at: '2026-11-26T10:10:00.000Z', app: { id: 1 } }] }
    if (path.includes('/status'))
      return { sha: head, statuses: [] }
    throw new Error(`unexpected request: ${path}`)
  },
}

beforeAll(async () => {
  await db.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: at }).onConflict(oc => oc.column('id').doNothing()).execute()
  await db.insertInto('project').values({ id: projectId, name: projectId, workspaceId: `workspace-${suffix}`, directory: `/isolated/${suffix}`, remoteUrl: `https://github.com/${repository}`, enabled: 1, orchestratorSessionId: null, createdAt: at, updatedAt: at }).execute()
  project = (await db.project.findById(projectId))!
  await db.thread.record({ id: threadId, channelId: 'github', refId: `${repository}:7`, kind: 'pull', title: 'PR 7', url: prUrl, createdAt: at, updatedAt: at, projectId, triage: 'claimed', triagedAt: at })
  await db.ticket.create({ id: ticketId, projectId, channelId: 'github', title: '修 PR', description: null, status: 'review', createdAt: at, updatedAt: at, startedAt: null, endedAt: null, prUrl, prState: 'open', ciState: 'passing', paused: 0, prepareError: null })
  await db.ticketThread.link(ticketId, threadId, at)
})

function collect(): Promise<{ ok: boolean, reason?: string }> {
  return pull.collect(remote, projectId, threadId)
}

function notices(triggerId: string) {
  return db.selectFrom('inbox').selectAll().where('triggerId', '=', triggerId).execute()
}

describe('同一 PR head 的 CI 快照只消费一次', () => {
  it('快照没变时既不重写触发时间，也不重复投递', async () => {
    expect(await collect()).toMatchObject({ ok: true })
    const triggerId = `github:pull:${repository}:7:revision:0`
    const first = await db.trigger.findById(triggerId)
    expect(first).toMatchObject({ kind: 'ci', human: 0, text: 'PR #7: open, CI passing' })
    expect(await notices(triggerId)).toMatchObject([{ type: 'project', origin: 'system', kind: 'notice', ticketId }])

    // 下一轮采集会重新算出同一份快照：触发行是它的消费标记，不该被当成新消息再写一遍。
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(await collect()).toMatchObject({ ok: true })
    expect((await db.trigger.findById(triggerId))?.at).toBe(first!.at)
    expect(await notices(triggerId)).toHaveLength(1)
    expect(await db.ciWatch.findTarget('github', 'pull', `${repository}:7`)).toMatchObject({ revision: 0, head })
  }, 30_000)

  it('cI 结论变化才换 revision 并重新投递', async () => {
    conclusion = 'failure'
    expect(await collect()).toMatchObject({ ok: true })
    const triggerId = `github:pull:${repository}:7:revision:1`
    expect(await db.trigger.findById(triggerId)).toMatchObject({ text: 'PR #7: open, CI failing' })
    expect(await notices(triggerId)).toMatchObject([{ ticketId, message: 'PR #7: open, CI failing' }])
    expect((await db.ticket.findById(ticketId))?.ciState).toBe('failing')
  }, 30_000)
})
