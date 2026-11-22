import { describe, expect, it } from 'vitest'
import { worktreeBranch } from '@/utils/branch'

describe('worktree branch naming', () => {
  it('names the branch after the task, not the ticket number', () => {
    expect(worktreeBranch('Fix blank session dock entry', 'T-013')).toBe('dsh/fix-blank-session-dock-entry')
    expect(worktreeBranch('waiting 票永久卡住', 'T-024')).toBe('dsh/waiting-票永久卡住')
  })

  it('folds punctuation and whitespace into single hyphens', () => {
    expect(worktreeBranch('  PR/MR 挂票：分支名不该做依赖!!  ', 'T-024')).toBe('dsh/pr-mr-挂票-分支名不该做依赖')
  })

  it('keeps the slug within a bounded length and never ends with a hyphen', () => {
    const branch = worktreeBranch(`${'a'.repeat(40)} ${'b'.repeat(40)}`, 'T-024')
    expect(branch.length).toBeLessThanOrEqual(52)
    expect(branch.endsWith('-')).toBe(false)
    expect(branch.split('/')[1]!.length).toBeLessThanOrEqual(48)
  })

  it('falls back to the ticket id only when the title has nothing usable', () => {
    expect(worktreeBranch('!!! ???', 'T-024')).toBe('dsh/t-024')
  })
})
