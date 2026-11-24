import { escapeRegex } from '@/channel/_shared/primitives'

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/
const QUOTE_LINE = /^ {0,3}>/

/**
 * 平台不会把围栏代码块、行内代码和引用块里的 @ 解析成 mention，
 * 判定点名之前先剥掉这些区域，避免「引用 bot 名字」被当成点名。
 */
function stripCodeAndQuotes(body: string): string {
  const visible: string[] = []
  let close: RegExp | null = null
  for (const line of body.split('\n')) {
    if (close) {
      if (close.test(line))
        close = null
      continue
    }
    const open = FENCE_OPEN.exec(line)
    if (open) {
      const marker = open[1]!
      close = new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`)
      continue
    }
    if (QUOTE_LINE.test(line))
      continue
    visible.push(line)
  }
  return stripInlineCode(visible.join('\n'))
}

function stripInlineCode(text: string): string {
  let visible = ''
  let index = 0
  while (index < text.length) {
    if (text[index] !== '`') {
      visible += text[index]
      index += 1
      continue
    }
    let size = 1
    while (text[index + size] === '`')
      size += 1
    const marker = '`'.repeat(size)
    let cursor = index + size
    let end = -1
    while (cursor < text.length) {
      const found = text.indexOf(marker, cursor)
      if (found < 0)
        break
      cursor = found + size
      if (text[found - 1] !== '`' && text[cursor] !== '`') {
        end = cursor
        break
      }
    }
    if (end < 0) {
      visible += marker
      index += size
      continue
    }
    visible += ' '
    index = end
  }
  return visible
}

/** GitHub 的 @ 只要求后面不是用户名字符。 */
export function githubMentioned(body: string, bots: { name: string }[]): boolean {
  const visible = stripCodeAndQuotes(body)
  return bots.some(bot => new RegExp(`@${escapeRegex(bot.name)}(?![a-z0-9-])`, 'i').test(visible))
}

/** GitLab 的 @ 还要求前面不是用户名字符，避免把邮箱当成点名。 */
export function gitlabMentioned(body: string, bots: { name: string }[]): boolean {
  const visible = stripCodeAndQuotes(body)
  return bots.some(bot => new RegExp(`(?:^|[^a-z0-9_@])@${escapeRegex(bot.name)}(?![a-z0-9_.-])`, 'i').test(visible))
}
