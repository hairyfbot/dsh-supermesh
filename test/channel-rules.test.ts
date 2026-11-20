import { describe, expect, it } from 'vitest'
import { acceptsChannelTrigger, addressedToBot } from '@/channel/_shared/admission'

describe('渠道新任务准入', () => {
  const base = { human: true, historical: false, subscribed: false, admin: false, mentioned: false, kind: 'comment', ignored: false }
  it('任意mention不能派工，管理员新话题或明确mention才能首次进入', () => {
    expect(acceptsChannelTrigger({ ...base, mentioned: true })).toBe(false)
    expect(acceptsChannelTrigger({ ...base, kind: 'open' })).toBe(false)
    expect(acceptsChannelTrigger({ ...base, admin: true })).toBe(false)
    expect(acceptsChannelTrigger({ ...base, admin: true, mentioned: true })).toBe(true)
    expect(acceptsChannelTrigger({ ...base, admin: true, kind: 'open' })).toBe(true)
  })
  it('历史话题和被忽略话题不能无条件回放，bot不能借管理员身份派工', () => {
    expect(acceptsChannelTrigger({ ...base, admin: true, mentioned: true, historical: true })).toBe(false)
    expect(acceptsChannelTrigger({ ...base, admin: true, kind: 'open', ignored: true })).toBe(false)
    expect(acceptsChannelTrigger({ ...base, admin: true, kind: 'open', ignored: true, mentioned: true })).toBe(true)
    expect(acceptsChannelTrigger({ ...base, admin: true, mentioned: true, human: false })).toBe(false)
  })
  it('已有订阅接收人类跟进但仍排除bot', () => {
    expect(acceptsChannelTrigger({ ...base, subscribed: true, historical: true })).toBe(true)
    expect(acceptsChannelTrigger({ ...base, subscribed: true, human: false })).toBe(false)
  })
})

describe('是否在跟 bot 说话', () => {
  it('没 @ 且没有票订阅时不算，@ 或已订阅才算', () => {
    expect(addressedToBot({ mentioned: false, subscribed: false })).toBe(false)
    expect(addressedToBot({ mentioned: true, subscribed: false })).toBe(true)
    expect(addressedToBot({ mentioned: false, subscribed: true })).toBe(true)
  })
  it('进流程的准入与是否被点名是两件事', () => {
    const base = { human: true, historical: false, subscribed: false, admin: true, mentioned: false, kind: 'open', ignored: false }
    expect(acceptsChannelTrigger(base)).toBe(true)
    expect(addressedToBot({ mentioned: base.mentioned, subscribed: base.subscribed })).toBe(false)
  })
})
