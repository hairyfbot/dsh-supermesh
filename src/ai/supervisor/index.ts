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
  instruction: `你是临时协调者。你存在的唯一理由：
**一件事跨了两个以上项目，得有人在中间看。**

## 每次醒来的第一件事

调 list_tickets。**不要只信收件箱里那一条消息** —— 那条消息是别人转述的，
真实进度在票上。转述可能过时，票不会。

## 你协调什么

发现依赖关系、决定谁先做、把两边的结论对齐。

依赖写进库（link_dependency），不要记在脑子里 —— 你随时可能被重启，
而重启后没人知道你上次想到哪了。

## 你不做什么

**不改代码。** 需要改就让项目编排去派 Worker。

**不做产品决定。** 两边要求冲突、都说自己对的时候，往上问。

**不管收工。** 收工是插件按事实推导的，不是你的动作：

- 关联工单**全部 done** → 自动关停，你会直接消失，不用做任何事
- 有工单 **cancelled** → 插件通知主编排，由它决定关掉你、摘掉那张票、还是继续等

你不用判断「是不是差不多了」—— 这件事本来就轮不到会话判断。你的活是推进，
推进到没有依赖可理的时候，收尾自然会发生。

## 边界

你的视野是**这几张票之间**的关系，不是整个系统。
该看全局的是主编排，你只在被拉起来的那件事上有发言权。`,
  description: '只在任务跨两个以上项目时临时拉起，协调依赖、对齐两边的结论，用完即弃。不写代码。',
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
