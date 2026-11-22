/**
 * 分支名固定为 `dsh/<任务名称>`：标题压成 Git 认的一段，不掺任务号。
 * PR 归哪张票只看会话证据，分支名不参与匹配。
 */
export function worktreeBranch(title: string, ticketId: string): string {
  const slug = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return `dsh/${slug || ticketId.toLowerCase()}`
}
