import { describe, expect, it } from 'vitest'
import { addressedToBot, channelTriggerRejection, channelTriggerStrength, ticketAllowed, triggerStrengthOf } from '@/channel/_shared/admission'

describe('渠道准入强度', () => {
  const base = { self: false, human: true, historical: false, subscribed: false, admin: false, mentioned: false, kind: 'comment', issue: false, ignored: false, inferred: 'observe' } as const

  it('没 @ bot 的消息最多是 inferred 候选', () => {
    expect(channelTriggerStrength({ ...base, admin: true, kind: 'open' })).toBe('inferred')
    expect(channelTriggerStrength({ ...base, admin: true, kind: 'open', inferred: 'auto' })).toBe('inferred')
  })

  it('inferred 模式 off 时没 @ 的消息不进流程', () => {
    expect(channelTriggerStrength({ ...base, admin: true, kind: 'open', inferred: 'off' })).toBeNull()
    expect(channelTriggerStrength({ ...base, admin: true, kind: 'comment', inferred: 'off' })).toBeNull()
  })

  it('只有管理员点名才是 explicit', () => {
    expect(channelTriggerStrength({ ...base, admin: true, mentioned: true })).toBe('explicit')
    expect(channelTriggerStrength({ ...base, admin: true, mentioned: true, inferred: 'off' })).toBe('explicit')
    expect(channelTriggerStrength({ ...base, mentioned: true })).toBeNull()
    expect(channelTriggerStrength({ ...base, kind: 'open' })).toBeNull()
  })

  it('历史话题和被忽略话题不能无条件回放，bot 不能借管理员身份进流程', () => {
    expect(channelTriggerStrength({ ...base, admin: true, mentioned: true, historical: true })).toBeNull()
    expect(channelTriggerStrength({ ...base, admin: true, kind: 'open', ignored: true })).toBeNull()
    expect(channelTriggerStrength({ ...base, admin: true, kind: 'open', ignored: true, mentioned: true })).toBe('explicit')
    expect(channelTriggerStrength({ ...base, admin: true, mentioned: true, human: false })).toBeNull()
  })

  it('已订阅话题绕过准入：管理员 explicit，其他人 inferred，off 档位照常投递', () => {
    expect(channelTriggerStrength({ ...base, subscribed: true, historical: true, admin: true })).toBe('explicit')
    expect(channelTriggerStrength({ ...base, subscribed: true, historical: true })).toBe('inferred')
    expect(channelTriggerStrength({ ...base, subscribed: true, historical: true, inferred: 'off' })).toBe('inferred')
  })

  it('已订阅话题上的 bot 消息按上下文送达，只有我们自己发的消息不产生触发', () => {
    expect(channelTriggerStrength({ ...base, subscribed: true, human: false })).toBe('inferred')
    expect(channelTriggerStrength({ ...base, subscribed: true, human: false, admin: true })).toBe('inferred')
    expect(channelTriggerStrength({ ...base, subscribed: true, self: true })).toBeNull()
    expect(channelTriggerStrength({ ...base, self: true, admin: true, mentioned: true })).toBeNull()
  })
})

describe('自己开的 issue', () => {
  const self = { self: true, human: false, historical: false, subscribed: false, admin: false, mentioned: false, kind: 'open', issue: true, ignored: false, inferred: 'observe' } as const

  it('自己开的 issue 以 self 强度回到主编排，不受 inferred 档位影响', () => {
    expect(channelTriggerStrength(self)).toBe('self')
    expect(channelTriggerStrength({ ...self, inferred: 'off' })).toBe('self')
    expect(channelTriggerRejection(self)).toBeNull()
  })

  it('self 的评论、非 issue 话题和已订阅话题仍然丢弃，原因是 self_actor', () => {
    for (const input of [
      { ...self, kind: 'comment' },
      { ...self, kind: 'close' },
      { ...self, issue: false },
      { ...self, subscribed: true },
    ]) {
      expect(channelTriggerStrength(input)).toBeNull()
      expect(channelTriggerRejection(input)).toBe('self_actor')
    }
  })

  it('self 不是 explicit：只说明这是自己开的活，不冒充人工点名', () => {
    expect(channelTriggerStrength(self)).not.toBe('explicit')
    expect(channelTriggerStrength({ ...self, admin: true, mentioned: true })).toBe('self')
    expect(ticketAllowed('self', 'off')).toBe(true)
    expect(ticketAllowed('self', 'observe')).toBe(true)
  })
})

describe('准入拒绝原因', () => {
  const base = { self: false, human: true, historical: false, subscribed: false, admin: false, mentioned: false, kind: 'comment', issue: false, ignored: false, inferred: 'observe' } as const

  it('被拒绝的消息给出可诊断原因，放行的消息没有原因', () => {
    expect(channelTriggerRejection({ ...base, mentioned: true })).toBe('not_administrator')
    expect(channelTriggerRejection({ ...base, admin: true })).toBe('not_mentioned')
    expect(channelTriggerRejection({ ...base, admin: true, kind: 'open', inferred: 'off' })).toBe('not_mentioned')
    expect(channelTriggerRejection({ ...base, admin: true, kind: 'open', ignored: true })).toBe('ignored_thread')
    expect(channelTriggerRejection({ ...base, admin: true, mentioned: true, historical: true })).toBe('historical')
    expect(channelTriggerRejection({ ...base, admin: true, mentioned: true, human: false })).toBe('bot_actor')
    expect(channelTriggerRejection({ ...base, self: true })).toBe('self_actor')
    expect(channelTriggerRejection({ ...base, subscribed: true, self: true })).toBe('self_actor')
    expect(channelTriggerRejection({ ...base, admin: true, mentioned: true })).toBeNull()
    expect(channelTriggerRejection({ ...base, subscribed: true })).toBeNull()
    expect(channelTriggerRejection({ ...base, subscribed: true, inferred: 'off' })).toBeNull()
    expect(channelTriggerRejection({ ...base, subscribed: true, human: false })).toBeNull()
  })

  it('拒绝原因与准入强度对同一条消息给出一致结论', () => {
    for (const input of [
      { ...base, mentioned: true },
      { ...base, admin: true, kind: 'open' },
      { ...base, admin: true, mentioned: true },
      { ...base, subscribed: true },
      { ...base, subscribed: true, inferred: 'off' as const },
      { ...base, self: true },
      { ...base, self: true, kind: 'open', issue: true },
      { ...base, self: true, kind: 'open', issue: true, subscribed: true },
      { ...base, admin: true, kind: 'open', ignored: true },
    ]) {
      const strength = channelTriggerStrength(input)
      const reason = channelTriggerRejection(input)
      expect(strength === null).toBe(reason !== null)
    }
  })
})

describe('已投递触发的强度', () => {
  it('管理员点名或管理员在订阅话题上的跟进是 explicit，其余只能是 inferred', () => {
    expect(triggerStrengthOf({ self: false, kind: 'comment', issue: false, human: true, mentioned: true, subscribed: false, admin: true })).toBe('explicit')
    expect(triggerStrengthOf({ self: false, kind: 'comment', issue: false, human: true, mentioned: false, subscribed: true, admin: true })).toBe('explicit')
    expect(triggerStrengthOf({ self: false, kind: 'comment', issue: false, human: true, mentioned: false, subscribed: true, admin: false })).toBe('inferred')
    expect(triggerStrengthOf({ self: false, kind: 'comment', issue: false, human: true, mentioned: true, subscribed: false, admin: false })).toBe('inferred')
    expect(triggerStrengthOf({ self: false, kind: 'comment', issue: false, human: false, mentioned: false, subscribed: true, admin: true })).toBe('inferred')
  })

  it('自己开的 issue 是 self，其余 self 触发仍只是 inferred', () => {
    expect(triggerStrengthOf({ self: true, kind: 'open', issue: true, human: false, mentioned: false, subscribed: false, admin: false })).toBe('self')
    expect(triggerStrengthOf({ self: true, kind: 'open', issue: true, human: false, mentioned: false, subscribed: false, admin: true })).toBe('self')
    expect(triggerStrengthOf({ self: true, kind: 'comment', issue: true, human: false, mentioned: false, subscribed: false, admin: false })).toBe('inferred')
    expect(triggerStrengthOf({ self: true, kind: 'open', issue: false, human: false, mentioned: false, subscribed: false, admin: false })).toBe('inferred')
    expect(triggerStrengthOf({ self: true, kind: 'open', issue: true, human: false, mentioned: false, subscribed: true, admin: false })).toBe('inferred')
  })
})

describe('建票闸', () => {
  it('inferred 候选只有 auto 模式允许建票，explicit、self 与人工建票不受限', () => {
    expect(ticketAllowed('inferred', 'off')).toBe(false)
    expect(ticketAllowed('inferred', 'observe')).toBe(false)
    expect(ticketAllowed('inferred', 'auto')).toBe(true)
    expect(ticketAllowed('explicit', 'off')).toBe(true)
    expect(ticketAllowed('self', 'off')).toBe(true)
    expect(ticketAllowed('self', 'observe')).toBe(true)
    expect(ticketAllowed(undefined, 'observe')).toBe(true)
  })
})

describe('是否在跟 bot 说话', () => {
  it('没 @ 且没有票订阅时不算，@ 或已订阅才算', () => {
    expect(addressedToBot({ mentioned: false, subscribed: false })).toBe(false)
    expect(addressedToBot({ mentioned: true, subscribed: false })).toBe(true)
    expect(addressedToBot({ mentioned: false, subscribed: true })).toBe(true)
  })
  it('进流程的准入与是否被点名是两件事', () => {
    const base = { self: false, human: true, historical: false, subscribed: false, admin: true, mentioned: false, kind: 'open', issue: true, ignored: false, inferred: 'observe' } as const
    expect(channelTriggerStrength(base)).toBe('inferred')
    expect(addressedToBot({ mentioned: base.mentioned, subscribed: base.subscribed })).toBe(false)
  })
})
