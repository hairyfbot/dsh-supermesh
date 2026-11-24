import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { bindThreads, recordThread } from '@/channel/_shared/thread'
import { db } from '@/database'

const suffix = randomUUID().slice(0, 8)
const repository = `owner/bound-${suffix}`
const at = new Date().toISOString()

beforeAll(async () => {
  await db.insertInto('channel').values({ id: 'github', name: 'GitHub', enabled: 1, host: null, createdAt: at }).onConflict(oc => oc.column('id').doNothing()).execute()
})

async function project(id: string, remoteUrl: string) {
  await db.insertInto('project').values({ id, name: id, workspaceId: `workspace-${id}`, directory: `/isolated/${id}`, remoteUrl, enabled: 1, orchestratorSessionId: null, createdAt: at, updatedAt: at }).execute()
}

function issue(number: number, name = repository) {
  return { channel: 'github' as const, refId: `${name}:${number}`, kind: 'issue' as const, title: `Issue ${number}`, url: `https://github.com/${name}/issues/${number}`, createdAt: at, updatedAt: at }
}

describe('采集侧话题归属', () => {
  // 用例走真实的共享库文件，整套并行跑时 fsync 会慢到超过默认的 5 秒。
  it('按仓库绑定归属，只补空值且不改分诊结论', async () => {
    const owner = `bind-owner-${suffix}`
    const other = `bind-other-${suffix}`
    const elsewhere = `owner/elsewhere-${suffix}`
    await project(owner, `https://github.com/${repository}`)
    await project(other, `https://github.com/owner/other-${suffix}`)

    const bound = await recordThread({ ...issue(1), projectId: owner })
    expect(bound).toMatchObject({ projectId: owner, triage: 'pending' })

    // 主编排已经写下归属的话题不被采集覆盖。
    const claimed = await recordThread({ ...issue(1), projectId: other })
    expect(claimed.projectId).toBe(owner)

    // 补归属只补同仓库还没有归属的话题，不动别的仓库。
    const unbound = await recordThread(issue(2))
    const foreign = await recordThread(issue(3, elsewhere))
    await bindThreads({ channel: 'github', refPrefix: `${repository}:`, projectId: owner })
    expect((await db.thread.findById(unbound.id))?.projectId).toBe(owner)
    expect((await db.thread.findById(foreign.id))?.projectId).toBeNull()
  }, 30_000)
})
