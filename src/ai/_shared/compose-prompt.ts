import { promptFile } from './prompt-file'

export type AgentRole = 'orchestrator' | 'manager' | 'worker' | 'supervisor'

/** 所有角色都读：职责划分 + 话题订阅 + 回复规则。 */
function common(): string[] {
  return [promptFile('shared'), promptFile('subscriptions'), promptFile('replies')]
}

/** 团队可改的三个段落：沟通、任务范围、交付要求（含合并与署名规则）。 */
function teamSections(): string[] {
  return [promptFile('team/communication'), promptFile('team/scope'), promptFile('team/delivery')]
}

/** 只有编排类角色读：渠道 CLI 用法。 */
function channelNotes(): string[] {
  return [promptFile('cli')]
}

/**
 * 组装一个角色的系统提示词，顺序对齐官方 `promptParts`：
 * 共用段 → 角色段 → 团队段落 → 执行细则 → 渠道说明。
 */
export function composePrompt(role: AgentRole): string {
  return [
    ...common(),
    promptFile(role),
    ...teamSections(),
    role === 'worker' ? promptFile('work') : '',
    ...channelNotes(),
  ].filter(Boolean).join('\n\n')
}
