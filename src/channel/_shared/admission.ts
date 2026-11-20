export function acceptsChannelTrigger(input: { human: boolean, historical: boolean, subscribed: boolean, admin: boolean, mentioned: boolean, kind: string, ignored: boolean }): boolean {
  if (!input.human || (input.historical && !input.subscribed))
    return false
  return input.subscribed || (input.admin && (input.kind === 'open' || input.mentioned) && (!input.ignored || input.mentioned))
}

/**
 * 进流程不等于被点名。没 @ bot 的消息只是时间线记录：可以分诊，但不建票、不派工、也不在渠道上发言。
 * 只有明确 @、或者这条话题已经被票订阅（人在跟进已有任务）才算在跟 bot 说话。
 */
export function addressedToBot(input: { mentioned: boolean, subscribed: boolean }): boolean {
  return input.mentioned || input.subscribed
}
