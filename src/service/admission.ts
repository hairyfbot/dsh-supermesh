import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'
import type { TriggerStrength } from '@/types/admission'
import { latestTrigger, triggerStrengthOf } from '@/channel/_shared/admission'
import { db } from '@/database'
import { setting } from '@/service/setting'

async function admin(actorName: string | null): Promise<boolean> {
  const name = (actorName ?? '').toLowerCase()
  return name !== '' && (await setting.load()).administrators.some(entry => entry.toLowerCase() === name)
}

/** 触发作者是不是我们在该渠道的 bot 账号；读取时现查账号表，不额外存 self 列。 */
async function ownAccount(trigger: Selectable<DB['trigger']>): Promise<boolean> {
  const name = (trigger.actorName ?? '').toLowerCase()
  return name !== '' && (await db.channelAccount.findByChannel(trigger.channelId)).some(account => account.role === 'bot' && account.name.toLowerCase() === name)
}

/** 按触发自身的点名事实和话题订阅判强度；订阅状态每次现查，票可能在建票之后才挂上。 */
export async function triggerStrength(trigger: Selectable<DB['trigger']>): Promise<TriggerStrength> {
  const thread = await db.thread.findById(trigger.threadId)
  const subscribed = (await db.ticketThread.listTicketIds(trigger.threadId)).length > 0
  return triggerStrengthOf({ self: await ownAccount(trigger), kind: trigger.kind, issue: thread?.kind === 'issue', human: Boolean(trigger.human), mentioned: Boolean(trigger.mentioned), subscribed, admin: await admin(trigger.actorName) })
}

/** 建票闸用：指定 triggerId 时按那条触发判，否则取这些话题里最新的一条人类触发。带上判的是哪条，拒绝时才能指出实际触发。 */
export async function latestTriggerStrength(threadIds: string[], triggerId?: string): Promise<{ strength: TriggerStrength, triggerId: string } | undefined> {
  const trigger = triggerId
    ? await db.trigger.findById(triggerId)
    : latestTrigger((await Promise.all(threadIds.map(id => db.trigger.listByThread(id, 20)))).flat())
  return trigger ? { strength: await triggerStrength(trigger), triggerId: trigger.id } : undefined
}
