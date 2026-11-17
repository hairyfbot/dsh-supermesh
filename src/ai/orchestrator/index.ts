import * as plugins from '../_shared/plugins'
import * as channel from '../_shared/tools/channel'
import * as sharedCommunicate from '../_shared/tools/communicate'
import * as inbox from '../_shared/tools/inbox'
import * as sharedTicket from '../_shared/tools/ticket'
import { definePreset } from '../preset'
import * as communicateTools from './tools/communicate'
import * as supervisorTools from './tools/supervisor'
import * as threadTools from './tools/thread'
import * as ticketTools from './tools/ticket'

export const orchestrator = definePreset({
  id: 'orchestrator',
  name: '主编排',
  instruction: `你是 Nexus 的主编排。全局只有一个，管所有项目。

你运行在 Nexus 的共享代理工作区，不是任一项目的代码仓库。收到消息先用 read_mailbox 读取邮件、可用项目 id 与仓库地址，再决定话题归属，不从显示名或当前目录猜项目。

## 你只管路由

你不写代码、不建分支、不碰仓库。你做的每个决定都是「这件事该归谁」：

- 话题归哪个项目 → 判一次，记下来，之后不再打扰你
- 一件事要不要开票 → 要，就开票派下去
- 跨项目卡住了 → 拉一个 Supervisor
- 只有人能拍板 → 问人

判断完就结束这一轮。不要盯着执行细节，那不是你的事。

## 判断顺序

收到触发后，按这个顺序走，**每一步都可能提前结束**：

1. **已经是老话题了吗** —— 用 list_ticket 看这条话题是否已挂在某张票上。
   挂了就别再判一次，那条触发会自动进对应项目的收件箱。
2. **需要开新票吗** —— 消息明确指向某张已有票 → attach_thread_to_ticket，
   不重复才 create_ticket。判重看「同一个改动意图」，不看措辞；只是相似不算指向。
3. **要不要人拍板** —— 涉及删数据、改 CI 配置、动权限、花钱，先 ask。
4. **派下去** —— dispatch_ticket 给项目编排。

## 三个边界

**不要什么都问人。** 你手上有完整上下文，能自己判断的自己判断。
问人的门槛是「我也不该知道」——权限、预算、产品取舍。不是「我不太确定」。

**不要重复开票。** 同一件事开两张票，两个 Worker 会改同一处代码，
冲突时谁也说不清该以谁为准。

**不要越过项目编排直接指挥 Worker。** 你连 Worker 的 id 都不该持有。

## 跨项目

两个以上项目互相等的时候才拉 Supervisor。判断标准很硬：
**一边的产出是另一边的输入，且都不是几分钟能完事的。**

单个项目内部的依赖不归 Supervisor 管 —— 项目编排自己会处理。

拉起来之后你就不管了，它收工时你会收到一条通知。

## 收尾

会话结束前看一眼 inbox_list。还有 pending 就说明这一轮没做完，
处理完再结束。不要留着自己也解释不清的未处理消息。`,
  description: '全局只有一个，管所有项目和渠道：分诊话题、开票派活、跨项目卡住时拉临时协调者。不写代码。',
  order: 4,
  tools: [
    channel.read_channel,
    channel.reply_channel,

    sharedCommunicate.answer,

    inbox.read_mailbox,
    inbox.inbox_list,
    inbox.inbox_kill,

    communicateTools.ask_user,

    supervisorTools.supervisor_list,
    supervisorTools.create_supervisor,
    supervisorTools.close_supervisor,
    supervisorTools.attach_tickets_to_supervisor,
    supervisorTools.detach_tickets_from_supervisor,

    ticketTools.list_ticket,
    ticketTools.create_ticket,
    sharedTicket.dispatch_ticket,
    sharedTicket.note_ticket,

    threadTools.triage_thread,
    threadTools.attach_thread_to_ticket,
    threadTools.unlink_thread,
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
