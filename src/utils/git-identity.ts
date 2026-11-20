/**
 * 平台按邮箱归属提交，名字只影响显示。用账号的 noreply 地址才能让 bot 的提交记在 bot 名下。
 * GitHub：`<id>+<login>@users.noreply.github.com`；GitLab：`<username>@users.noreply.<host>`。
 */
export function noreplyEmail(kind: 'github' | 'gitlab', login: string, providerId: string, host: string): string {
  const name = login.trim()
  if (!name)
    return ''
  if (kind === 'github') {
    const id = providerId.trim()
    return /^\d+$/.test(id) ? `${id}+${name}@users.noreply.github.com` : ''
  }
  try {
    return `${name}@users.noreply.${new URL(host).host}`
  }
  catch { return '' }
}
