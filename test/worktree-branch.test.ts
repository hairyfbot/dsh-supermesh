import { describe, expect, it } from 'vitest'
import { worktreeBranch } from '@/utils/branch'

describe('worktree branch naming', () => {
  it('names the branch after the task, not the ticket number', () => {
    expect(worktreeBranch('Fix blank session dock entry', 'T-013')).toBe('dsh/fix-blank-session-dock-entry')
  })

  it('keeps only the ASCII words of a mixed title', () => {
    expect(worktreeBranch('waiting 票永久卡住：worker 用自造分支开 PR，PR 挂不上票', 'T-024')).toBe('dsh/waiting-worker-pr-pr')
    expect(worktreeBranch('  PR/MR 挂票：分支名不该做依赖!!  ', 'T-024')).toBe('dsh/pr-mr')
  })

  it('always yields a pure ASCII branch name', () => {
    for (const title of ['修复登录重试', 'waiting 票永久卡住', 'Fix 登录 retry', '']) {
      expect(worktreeBranch(title, 'T-024')).toMatch(/^dsh\/[a-z0-9-]+$/)
    }
  })

  it('falls back to a stable digest when the title has no usable ASCII', () => {
    const branch = worktreeBranch('修复登录重试', 'T-024')
    expect(branch).toMatch(/^dsh\/task-[0-9a-f]{6}$/)
    expect(worktreeBranch('修复登录重试', 'T-024')).toBe(branch)
    expect(worktreeBranch('修复登录重试', 'T-025')).not.toBe(branch)
  })

  it('keeps the slug within a bounded length and never ends with a hyphen', () => {
    const branch = worktreeBranch(`${'a'.repeat(40)} ${'b'.repeat(40)}`, 'T-024')
    expect(branch.split('/')[1]!.length).toBeLessThanOrEqual(40)
    expect(branch.endsWith('-')).toBe(false)
  })
})
