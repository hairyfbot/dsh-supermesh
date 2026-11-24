import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'
import type { TriggerStrength } from '@/types/admission'
import { triggerStrengthOf } from '@/channel/_shared/admission'
import { db } from '@/database'
import { setting } from '@/service/setting'

async function admin(actorName: string | null): Promise<boolean> {
  const name = (actorName ?? '').toLowerCase()
  return name !== '' && (await setting.load()).administrators.some(entry => entry.toLowerCase() === name)
}

/** 按触发自身的点名事实和话题订阅判强度；订阅状态每次现查，票可能在建票之后才挂上。 */
export async function triggerStrength(trigger: Selectable<DB['trigger']>): Promise<TriggerStrength> {
  const subscribed = (await db.ticketThread.listTicketIds(trigger.threadId)).length > 0
  return triggerStrengthOf({ human: Boolean(trigger.human), mentioned: Boolean(trigger.mentioned), subscribed, admin: await admin(trigger.actorName) })
}

/** 建票闸用：指定 triggerId 时按那条触发判，否则取这些话题里最新的一条人类触发。 */
export async function latestTriggerStrength(threadIds: string[], triggerId?: string): Promise<TriggerStrength | undefined> {
  if (triggerId) {
    const trigger = await db.trigger.findById(triggerId)
    return trigger ? triggerStrength(trigger) : undefined
  }
  const candidates = (await Promise.all(threadIds.map(id => db.trigger.listByThread(id, 20)))).flat()
  const human = candidates.filter(row => row.human === 1)
  const trigger = (human.length ? human : candidates).sort((left, right) => right.at.localeCompare(left.at))[0]
  return trigger ? triggerStrength(trigger) : undefined
}
