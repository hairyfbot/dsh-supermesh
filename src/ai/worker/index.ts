import { composePrompt } from '../_shared/compose-prompt'
import * as plugins from '../_shared/plugins'
import * as channel from '../_shared/tools/channel'
import { definePreset } from '../preset'
import * as tools from './tools'

export const worker = definePreset({
  id: 'worker',
  name: '执行会话',
  instruction: composePrompt('worker'),
  order: 7,
  tools: [
    channel.read_channel,

    tools.report,
    tools.ask,
  ],
  plugins: [
    plugins.agentInstructions,
    plugins.compaction,
    plugins.commandGoal,
    plugins.delegation,
    plugins.skillFilesystem,
    plugins.timeContext,
    plugins.toolBash,
    plugins.toolExecutorPtc,
    plugins.toolFs,
    plugins.toolFsSearch,
    plugins.toolJobs,
    plugins.toolPresent,
    plugins.toolPwsh,
    plugins.toolSkill,
    plugins.toolTodo,
    plugins.toolWeb,
  ],
})
