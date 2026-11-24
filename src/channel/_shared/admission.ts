import type { InferredMode, TriggerStrength } from '@/types/admission'

export interface AdmissionInput {
  /** 我们自己账号发的消息，不产生触发。 */
  self: boolean
  human: boolean
  historical: boolean
  subscribed: boolean
  admin: boolean
  mentioned: boolean
  kind: string
  ignored: boolean
  inferred: InferredMode
}

type Admission = { strength: TriggerStrength } | { reason: string }

/**
 * 准入只回答「这条消息能不能进流程」，强度回答「它算不算开工请求」。
 * 订阅话题上的消息按官方语义绕过准入：不查 @、不查发送者、不受 inferred 档位影响，只排除我们自己发的那条。
 * 没 @ bot 的消息最多是 inferred 候选，只有管理员点名或已订阅话题上的跟进才是 explicit。
 */
export function channelTriggerStrength(input: AdmissionInput): TriggerStrength | null {
  const outcome = evaluate(input)
  return 'strength' in outcome ? outcome.strength : null
}

/** 被准入拒绝的原因码，用于把「消息被静默丢弃」变成可诊断的痕迹。 */
export function channelTriggerRejection(input: AdmissionInput): string | null {
  const outcome = evaluate(input)
  return 'reason' in outcome ? outcome.reason : null
}

function evaluate(input: AdmissionInput): Admission {
  if (input.self)
    return { reason: 'self_actor' }
  if (input.subscribed)
    return { strength: input.human && input.admin ? 'explicit' : 'inferred' }
  if (!input.human)
    return { reason: 'bot_actor' }
  if (input.historical)
    return { reason: 'historical' }
  if (!input.admin)
    return { reason: 'not_administrator' }
  if (input.ignored && !input.mentioned)
    return { reason: 'ignored_thread' }
  if (input.mentioned)
    return { strength: 'explicit' }
  return input.kind === 'open' && input.inferred !== 'off' ? { strength: 'inferred' } : { reason: 'not_mentioned' }
}

/** 已投递的触发按当前事实判强度，供收件箱与建票闸使用；机器人不授予开工权限。 */
export function triggerStrengthOf(input: { human: boolean, mentioned: boolean, subscribed: boolean, admin: boolean }): TriggerStrength {
  return input.human && input.admin && (input.mentioned || input.subscribed) ? 'explicit' : 'inferred'
}

/** 建票闸：没有触发来源（人工建票）放行，inferred 候选只有 auto 模式才允许开票。 */
export function ticketAllowed(strength: TriggerStrength | undefined, inferred: InferredMode): boolean {
  return strength !== 'inferred' || inferred === 'auto'
}

/**
 * 进流程不等于被点名。没 @ bot 的消息只是时间线记录：可以分诊，但不建票、不派工、也不在渠道上发言。
 * 只有明确 @、或者这条话题已经被票订阅（人在跟进已有任务）才算在跟 bot 说话。
 */
export function addressedToBot(input: { mentioned: boolean, subscribed: boolean }): boolean {
  return input.mentioned || input.subscribed
}
