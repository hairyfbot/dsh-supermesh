import { composePrompt } from '../_shared/compose-prompt'
import * as plugins from '../_shared/plugins'
import * as channel from '../_shared/tools/channel'
import * as inbox from '../_shared/tools/inbox'
import { definePreset } from '../preset'
import * as communicateTools from './tools/communicate'
import * as supervisorTools from './tools/supervisor'
import * as ticketTools from './tools/ticket'
import * as workerTools from './tools/worker'

export const manager = definePreset({
  id: 'manager',
  name: '项目编排',
  description: '一个仓库一个：派 Worker、看汇报、收尾，任务走到哪一步由它推。不写代码。',
  instruction: composePrompt('manager'),
  order: 5,
  tools: [
    channel.read_channel,
    channel.reply_channel,

    inbox.read_mailbox,
    inbox.inbox_list,
    inbox.inbox_kill,

    communicateTools.report,
    communicateTools.ask,
    communicateTools.escalate,

    supervisorTools.supervisor_list,

    ticketTools.list_ticket,
    ticketTools.link_ticket,
    ticketTools.stop_ticket,
    ticketTools.retry_ticket,

    workerTools.create_worker,
    workerTools.send,
    workerTools.view,
    workerTools.cancel,
    workerTools.rename,
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
