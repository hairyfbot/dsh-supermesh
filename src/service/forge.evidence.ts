import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** 只有这两个工具会把命令交给 shell，证据也只从它们的调用与结果里取。 */
const SHELL_TOOLS = new Set(['bash', 'pwsh'])
const CREATE = /\bglab\s+mr\s+(?:create|new)\b/
const PUSH = /\bgit(?:\s+(?:-[Cc]\s+\S+|--[\w-]+(?:=\S+)?))*\s+push\b/
const TARGET = /^To (\S+)$/
const REF = /^ [ +*=] (\[[^\]]+\]|\S+) +\S+ -> (\S+)(?: \(.*\))?$/
const MR_URL = /\bhttps?:\/\/[^\s"'<>]+?\/merge_requests\/\d+(?![\w-])/g

export interface PushedRef {
  remote: string
  branch: string
}

export interface ShellEvidence {
  /** `glab mr create` 打印出来的 MR 地址。 */
  urls: string[]
  /** `git push` 报告已创建或已更新的分支。 */
  branches: PushedRef[]
}

/**
 * 读 `git push` 输出里被推上去的分支。每条引用行归属最近一条 `To <remote>`，
 * 被拒绝、被删除的引用和新标签不算 —— 它们不会开出变更请求。
 */
export function pushedBranches(text: string): PushedRef[] {
  const pushed: PushedRef[] = []
  let remote: string | undefined
  for (const line of text.split(/\r?\n/)) {
    const target = TARGET.exec(line)
    if (target) {
      remote = target[1]
      continue
    }
    const ref = REF.exec(line)
    if (!remote || !ref)
      continue
    const [, summary = '', destination = ''] = ref
    if (summary === '[new tag]')
      continue
    const branch = destination.startsWith('refs/heads/') ? destination.slice(11) : destination
    if (branch.startsWith('refs/'))
      continue
    if (!pushed.some(entry => entry.remote === remote && entry.branch === branch))
      pushed.push({ remote, branch })
  }
  return pushed
}

/** 取命令输出里的 MR 地址，保持首次出现的顺序。 */
export function mergeRequestUrls(text: string): string[] {
  return [...new Set(text.match(MR_URL) ?? [])]
}

/**
 * 从会话日志里取 Worker 自己留下的开单证据：`glab mr create` 打印的地址，
 * 以及 `git push` 推上去的分支。只认工具调用本身成功的结果。
 */
export function shellEvidence(events: readonly SessionEvent[]): ShellEvidence {
  const pending = new Map<string, { urls: boolean, pushes: boolean }>()
  const urls: string[] = []
  const branches: PushedRef[] = []
  for (const event of events) {
    if (event.type === 'turn/end') {
      pending.clear()
      continue
    }
    if (event.type === 'tool/call') {
      const { callId, name, arguments: raw } = event.data
      if (!SHELL_TOOLS.has(name))
        continue
      const command = commandOf(raw)
      if (command === undefined)
        continue
      const creates = CREATE.test(command)
      const pushes = PUSH.test(command)
      if (creates || pushes)
        pending.set(callId, { urls: creates, pushes })
      continue
    }
    if (event.type !== 'tool/result')
      continue
    const { message } = event.data
    const evidence = pending.get(message.toolCallId)
    if (!evidence)
      continue
    pending.delete(message.toolCallId)
    if (message.isError === true)
      continue
    const text = message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
    if (evidence.urls)
      urls.push(...mergeRequestUrls(text))
    if (evidence.pushes)
      branches.push(...pushedBranches(text))
  }
  return {
    urls: [...new Set(urls)],
    branches: branches.filter((entry, index) => branches.findIndex(other => other.remote === entry.remote && other.branch === entry.branch) === index),
  }
}

function commandOf(raw: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null)
    return undefined
  const command = (parsed as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}
