import type { SessionEvent } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    /**
     * 程序化工具调用：Worker 在 run_code 里调 `tools.pwsh({ command })` 时，
     * 命令只出现在这个事件里，结果仍以 rootCallId 对应的 `tool/result` 落库。
     */
    'tool/ptc-dispatch': {
      rootCallId: string
      parentCallId?: string
      subCallId?: string
      name: string
      arguments: unknown
    }
  }
}

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
 *
 * 两种调用形态都要认，Worker 换模式时不能丢绑定：
 * - 标准模式：模型直接调 `pwsh` / `bash`，命令在 `tool/call` 里；
 * - 程序模式：模型在 `run_code` 里调 `tools.pwsh(...)`，命令在 `tool/ptc-dispatch` 里。
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
    const call = shellCall(event)
    if (call) {
      if (!SHELL_TOOLS.has(call.name))
        continue
      const creates = CREATE.test(call.command)
      const pushes = PUSH.test(call.command)
      if (!creates && !pushes)
        continue
      // 同一个 run_code 里可以先 push 再开单：同一条结果要同时按两种证据读。
      const previous = pending.get(call.key)
      pending.set(call.key, { urls: creates || Boolean(previous?.urls), pushes: pushes || Boolean(previous?.pushes) })
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

/** 直接调用的 shell 工具（标准模式）与 run_code 里程序化调用的同一个工具（程序模式）都算一次 shell 调用。 */
function shellCall(event: SessionEvent): { key: string, name: string, command: string } | null {
  if (event.type === 'tool/call') {
    const command = commandOf(event.data.arguments)
    return command === undefined ? null : { key: event.data.callId, name: event.data.name, command }
  }
  if (event.type === 'tool/ptc-dispatch') {
    const command = commandOf(event.data.arguments)
    return command === undefined ? null : { key: event.data.rootCallId, name: event.data.name, command }
  }
  return null
}

function commandOf(raw: unknown): string | undefined {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    }
    catch {
      return undefined
    }
  }
  if (typeof parsed !== 'object' || parsed === null)
    return undefined
  const command = (parsed as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}
