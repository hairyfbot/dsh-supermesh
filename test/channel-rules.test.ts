import { describe, expect, it } from 'vitest'
import { addressedToBot, channelTriggerStrength, ticketAllowed, triggerStrengthOf } from '@/channel/_shared/admission'

describe('渠道准入强度', () => {
  const base = { human: true, historical: false, subscribed: false, admin: false, mentioned: false, kind: 'comment', ignored: false, inferred: 'observe' } as const

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

  it('已订阅话题接收人类跟进：管理员 explicit，其他人 inferred，off 时拒绝', () => {
    expect(channelTriggerStrength({ ...base, subscribed: true, historical: true, admin: true })).toBe('explicit')
    expect(channelTriggerStrength({ ...base, subscribed: true, historical: true })).toBe('inferred')
    expect(channelTriggerStrength({ ...base, subscribed: true, historical: true, inferred: 'off' })).toBeNull()
    expect(channelTriggerStrength({ ...base, subscribed: true, human: false })).toBeNull()
  })
})

describe('已投递触发的强度', () => {
  it('管理员点名或管理员在订阅话题上的跟进是 explicit，其余只能是 inferred', () => {
    expect(triggerStrengthOf({ mentioned: true, subscribed: false, admin: true })).toBe('explicit')
    expect(triggerStrengthOf({ mentioned: false, subscribed: true, admin: true })).toBe('explicit')
    expect(triggerStrengthOf({ mentioned: false, subscribed: true, admin: false })).toBe('inferred')
    expect(triggerStrengthOf({ mentioned: true, subscribed: false, admin: false })).toBe('inferred')
  })
})

describe('建票闸', () => {
  it('inferred 候选只有 auto 模式允许建票，explicit 与人工建票不受限', () => {
    expect(ticketAllowed('inferred', 'off')).toBe(false)
    expect(ticketAllowed('inferred', 'observe')).toBe(false)
    expect(ticketAllowed('inferred', 'auto')).toBe(true)
    expect(ticketAllowed('explicit', 'off')).toBe(true)
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
    const base = { human: true, historical: false, subscribed: false, admin: true, mentioned: false, kind: 'open', ignored: false, inferred: 'observe' } as const
    expect(channelTriggerStrength(base)).toBe('inferred')
    expect(addressedToBot({ mentioned: base.mentioned, subscribed: base.subscribed })).toBe(false)
  })
})
