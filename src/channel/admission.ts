export function acceptsChannelTrigger(input: { human: boolean, historical: boolean, subscribed: boolean, admin: boolean, mentioned: boolean, kind: string, ignored: boolean }): boolean {
  if (!input.human || (input.historical && !input.subscribed))
    return false
  return input.subscribed || (input.admin && (input.kind === 'open' || input.mentioned) && (!input.ignored || input.mentioned))
}
