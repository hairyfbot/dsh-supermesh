import { describe, expect, it } from 'vitest'
import { acceptsChannelTrigger } from '../src/channel/admission'
import { observationBaseline, readConfigurationMetadata, validateConfiguration } from '../src/channel/configuration'
import { commentIssueNumber } from '../src/channel/github/channel'

describe('渠道配置可信边界', () => {
  it('core只验证DTO对象边界，不固定平台专属配置字段', () => {
    expect(() => validateConfiguration({ providerOption: 'custom' })).not.toThrow()
    for (const value of [null, undefined, 'config', []])
      expect(() => validateConfiguration(value)).toThrow('invalid_channel_config')
  })
  it('卸载后的历史配置metadata仍可读取，坏metadata不静默清空', () => {
    expect(readConfigurationMetadata()).toEqual({ commitName: '', commitEmail: '' })
    expect(readConfigurationMetadata(JSON.stringify({ commitName: 'Bot', commitEmail: 'bot@example.com', expectedAccount: 'legacy-bot' }))).toEqual({ commitName: 'Bot', commitEmail: 'bot@example.com' })
    expect(() => readConfigurationMetadata('{')).toThrow()
    expect(() => readConfigurationMetadata(JSON.stringify({ commitName: 1, commitEmail: '' }))).toThrow('invalid_channel_metadata')
  })
})

describe('首次观察范围', () => {
  it('取启用起点与项目创建时间较晚值，不使用轮询时刻', () => {
    expect(observationBaseline('2026-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z')
    expect(observationBaseline('2025-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')).toBe('2026-01-02T00:00:00.000Z')
    expect(() => observationBaseline('invalid', '2026-01-02T00:00:00.000Z')).toThrow('invalid_observation_baseline')
  })
})

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

describe('gitHub评论父话题地址', () => {
  it('只从同仓库固定API地址提取安全正整数，不接受任意URL', () => {
    expect(commentIssueNumber('https://api.github.com/repos/Owner/Repo/issues/42', 'owner/repo')).toBe(42)
    for (const value of ['https://evil.example/repos/owner/repo/issues/42', 'https://api.github.com/repos/other/repo/issues/42', 'https://api.github.com/repos/owner/repo/issues/0', 'https://api.github.com/repos/owner/repo/issues/9007199254740992', 'https://api.github.com/repos/owner/repo/issues/42?redirect=evil', 'https://api.github.com/repos/owner/repo/issues/42/../43'])
      expect(commentIssueNumber(value, 'owner/repo')).toBeNull()
  })
})
