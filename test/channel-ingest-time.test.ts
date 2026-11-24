import { describe, expect, it } from 'vitest'
import { github } from '@/channel/github/channel'
import { binding as githubBinding } from '@/channel/github/service/binding'
import { gitlab } from '@/channel/gitlab/channel'
import { binding as gitlabBinding } from '@/channel/gitlab/service/binding'

const githubIngestor = githubBinding.of(github).ingestor
const gitlabIngestor = gitlabBinding.of(gitlab).ingest

describe('触发记的是事件发生时间', () => {
  // 评论会把 issue 的 updated_at 刷新成评论时刻：拿它当发生时间，
  // 「开 issue」就会被记成最新活动时刻，建票闸按时间挑触发时会挑中它而不是那条真正 @ 的评论。
  it('gitHub 的 issue 被评论后仍按开 issue 的时刻记触发', () => {
    const row = { id: 1, created_at: '2026-10-18T09:00:00Z', updated_at: '2026-10-25T11:00:00Z' }
    expect(githubIngestor.at(row, 'open')).toBe('2026-10-18T09:00:00.000Z')
  })

  it('gitHub 的评论按评论自己的时刻记触发', () => {
    const row = { id: 2, created_at: '2026-10-19T09:00:00Z', updated_at: '2026-10-19T09:00:00Z' }
    expect(githubIngestor.at(row, 'comment')).toBe('2026-10-19T09:00:00.000Z')
  })

  it('gitHub 的关闭事件取关闭时刻', () => {
    const row = { id: 1, created_at: '2026-10-18T09:00:00Z', closed_at: '2026-10-26T09:00:00Z', updated_at: '2026-10-26T09:00:00Z' }
    expect(githubIngestor.at(row, 'close')).toBe('2026-10-26T09:00:00.000Z')
  })

  it('gitLab 的 issue 被评论后仍按开 issue 的时刻记触发，关闭取关闭时刻', () => {
    const row = { id: 1, created_at: '2026-10-18T09:00:00Z', closed_at: '2026-10-26T09:00:00Z', updated_at: '2026-10-26T09:00:00Z' }
    expect(gitlabIngestor.at(row, 'open')).toBe('2026-10-18T09:00:00.000Z')
    expect(gitlabIngestor.at(row, 'comment')).toBe('2026-10-18T09:00:00.000Z')
    expect(gitlabIngestor.at(row, 'close')).toBe('2026-10-26T09:00:00.000Z')
  })
})
