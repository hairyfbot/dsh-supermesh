import { describe, expect, it } from 'vitest'
import { githubMentioned, gitlabMentioned } from '@/channel/_shared/mention'

const bots = [{ name: 'hairyfbot' }]
const mentioned = (body: string) => [githubMentioned(body, bots), gitlabMentioned(body, bots)]

describe('点名判定剥掉平台不解析成 mention 的区域', () => {
  it('行内代码里的 @ 不算点名', () => {
    expect(mentioned('| 2026-11-24T02:38:23Z | 评论 `@hairyfbot 修复并提交 PR` |')).toEqual([false, false])
  })

  it('围栏代码块里的 @ 不算点名', () => {
    expect(mentioned(['```', '@hairyfbot 修复并提交 PR', '```'].join('\n'))).toEqual([false, false])
    expect(mentioned(['~~~ts', '@hairyfbot', '~~~'].join('\n'))).toEqual([false, false])
  })

  it('引用块里的 @ 不算点名', () => {
    expect(mentioned('> @hairyfbot 修复并提交 PR')).toEqual([false, false])
  })

  it('没闭合的围栏吞掉后面的正文', () => {
    expect(mentioned(['```', '@hairyfbot'].join('\n'))).toEqual([false, false])
  })

  it('代码块外的 @ 仍然算点名', () => {
    expect(mentioned('@hairyfbot 修复并提交 PR')).toEqual([true, true])
    expect(mentioned('麻烦 @hairyfbot 看一下')).toEqual([true, true])
    expect(mentioned(['`@hairyfbot` 和 @hairyfbot'].join('\n'))).toEqual([true, true])
    expect(mentioned(['> 引用', '@hairyfbot 修一下'].join('\n'))).toEqual([true, true])
    expect(mentioned(['```ts', '@hairyfbot', '```', '@hairyfbot 修'].join('\n'))).toEqual([true, true])
  })

  it('反引号要配对才算行内代码', () => {
    expect(mentioned('``代码里的 ` 和 @hairyfbot``')).toEqual([false, false])
    expect(mentioned('`未闭合的 @hairyfbot')).toEqual([true, true])
  })

  it('大小写和名字边界按平台规则判定', () => {
    expect(mentioned('@HairyFBot 修复')).toEqual([true, true])
    expect(mentioned('@hairyfbot2 修复')).toEqual([false, false])
  })
})
