import { describe, expect, it } from 'vitest'
import { noreplyEmail } from '@/utils/git-identity'

describe('渠道账号的提交邮箱', () => {
  it('github 用账号 id 与登录名拼 noreply 地址', () => {
    expect(noreplyEmail('github', 'HairyfBot', '318164157', 'https://github.com')).toBe('318164157+HairyfBot@users.noreply.github.com')
  })
  it('github 拿不到数字账号 id 时不猜地址', () => {
    expect(noreplyEmail('github', 'HairyfBot', '', 'https://github.com')).toBe('')
    expect(noreplyEmail('github', 'HairyfBot', 'github:bot', 'https://github.com')).toBe('')
  })
  it('gitlab 用登录名与站点域名拼 noreply 地址', () => {
    expect(noreplyEmail('gitlab', 'bot', '', 'https://gitlab.com')).toBe('bot@users.noreply.gitlab.com')
    expect(noreplyEmail('gitlab', 'bot', '', 'https://git.example.com')).toBe('bot@users.noreply.git.example.com')
  })
  it('缺少登录名或站点非法时返回空串', () => {
    expect(noreplyEmail('github', '  ', '318164157', 'https://github.com')).toBe('')
    expect(noreplyEmail('gitlab', 'bot', '', 'not a url')).toBe('')
  })
})
