import { createHash } from 'node:crypto'

/**
 * 分支名固定为 `dsh/<任务名称>`，且必须是纯 ASCII：标题里的字母数字压成一段，
 * 标题本身没有可用的 ASCII 时用任务号的短摘要兜底。
 * PR 归哪张票只看会话证据，分支名不参与匹配。
 */
export function worktreeBranch(title: string, ticketId: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  if (slug.length >= 3)
    return `dsh/${slug}`
  const digest = createHash('sha256').update(ticketId).digest('hex').slice(0, 6)
  return `dsh/${slug ? `${slug}-${digest}` : `task-${digest}`}`
}
