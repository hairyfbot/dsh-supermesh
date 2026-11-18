import { composePrompt } from '../_shared/compose-prompt'
import * as plugins from '../_shared/plugins'
import * as channel from '../_shared/tools/channel'
import * as sharedCommunicate from '../_shared/tools/communicate'
import * as inbox from '../_shared/tools/inbox'
import * as sharedTicket from '../_shared/tools/ticket'
import { definePreset } from '../preset'
import * as tools from './tools'

export const supervisor = definePreset({
  id: 'supervisor',
  name: '临时协调者',
  instruction: composePrompt('supervisor'),
  order: 6,
  tools: [
    channel.read_channel,

    sharedCommunicate.answer,

    inbox.read_mailbox,
    inbox.inbox_list,
    inbox.inbox_kill,

    sharedTicket.dispatch_ticket,
    sharedTicket.note_ticket,

    tools.list_ticket,

    tools.report,
    tools.ask,

    tools.link_dependency,
  ],
  plugins: [
    plugins.agentInstructions,
    plugins.compaction,
    plugins.commandGoal,
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
