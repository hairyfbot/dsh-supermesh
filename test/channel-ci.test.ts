import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { notifyBranchCi } from '@/channel/_shared/ci'
import { db } from '@/database'

const suffix = randomUUID().slice(0, 8)
const projectId = `ci-project-${suffix}`
const repository = `owner/repo-${suffix}`
const ref = `${repository}:branch:main`
const threadId = `github:${ref}`
const at = new Date().toISOString()

beforeAll(async () => {
  await db.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: at }).onConflict(oc => oc.column('id').doNothing()).execute()
  await db.insertInto('project').values({ id: projectId, name: 'CI 采集', workspaceId: `ci-workspace-${suffix}`, directory: `/tmp/ci-${suffix}`, remoteUrl: `https://github.com/${repository}`, enabled: 1, orchestratorSessionId: null, createdAt: at, updatedAt: at }).execute()
})

function notify(fingerprint: string): Promise<void> {
  return notifyBranchCi({ channel: 'github', projectId, ref, fingerprint, head: `head-${fingerprint}`, title: 'CI main', message: `main CI failing: ${fingerprint}`, url: `https://github.com/${repository}/commit/${fingerprint}`, silent: false })
}

function notices(triggerId: string) {
  return db.selectFrom('inbox').selectAll().where('triggerId', '=', triggerId).execute()
}

describe('分支 CI 通知', () => {
  it('没有票订阅时只落库，不进任何收件箱', async () => {
    await notify('first')
    expect(await db.thread.findById(threadId)).toMatchObject({ kind: 'ci', projectId })
    expect(await db.trigger.findById(`${threadId}:revision:0`)).toMatchObject({ kind: 'ci', human: 0 })
    expect(await notices(`${threadId}:revision:0`)).toEqual([])
  })

  it('票订阅后按票所属项目投递并带上票号', async () => {
    const ticketId = `ticket-${suffix}`
    await db.ticket.create({ id: ticketId, projectId, channelId: 'github', title: '修 CI', description: null, status: 'queued', createdAt: at, updatedAt: at, startedAt: null, endedAt: null, prUrl: null, prState: null, ciState: null, paused: 0, prepareError: null })
    await db.ticketThread.link(ticketId, threadId, at)
    await notify('second')
    expect(await notices(`${threadId}:revision:1`)).toMatchObject([{ type: 'project', origin: 'system', kind: 'notice', projectId, ticketId, threadId }])
  })

  it('票已结单后不再投递', async () => {
    await db.ticket.update(`ticket-${suffix}`, { status: 'done', updatedAt: at })
    await notify('third')
    expect(await db.trigger.findById(`${threadId}:revision:2`)).toMatchObject({ kind: 'ci' })
    expect(await notices(`${threadId}:revision:2`)).toEqual([])
  })
})
