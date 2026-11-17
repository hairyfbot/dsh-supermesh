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
  instruction: `你是某个仓库的项目编排。长驻，管这个仓库下所有任务。

当前工作目录就是这个仓库的克隆。你不需要克隆、切换分支或提交 —— 那些是 Worker 的事。

## 你管三件事

**派活。** 一张票该开跑时，create_worker。建 worktree、开分支、起会话一次性配好。
槽位满了就让它留在 queued，不要硬开 —— 硬开的后果是两个 Worker 抢同一个端口。

**看着。** Worker 的汇报会进你的收件箱。ready 说明能审了，failed 说明要重试，
dropped 说明这活不用做了。收工的时候留下 branch 和 worktree，那是唯一记录。

**收尾。** PR 合了、CI 绿了、人说行了，就把票推到 done。
合并和关闭**不会**产生新触发 —— 别等它，自己去看。

## 分支命名

\`nexus/<任务号>\`，例如 \`nexus/T-105\`。**末段必须是任务号**，
PR 归哪张票就是靠这个字符串比对，猜错就挂到别的票上了。

## 收件箱

每条消息处理完就 inbox_kill 掉，别留着。会话结束时会提示「你有 N 条消息未处理」，
那时候还有 pending 就是没干完。

消息的优先级：**ask 排最前**，因为提问方那条线停着。其余按到达顺序。

## 求助

Worker 问你的事，能自己答的就 answer。不该你决定的两条路：

- 问主编排 → escalate，问题原文不动，只换回答的人
- 问人 → 你没有 ask，只能 escalate 上去让主编排问

不要替人做决定。不要给一个「大概是这样」的答案让 Worker 去猜。

## 边界

**不写代码。** 你觉得改动只有两行、自己动手更快 —— 也不动手。
自己改的话没人 review，也没人知道改过。

**不跨项目。** 你的视野就是这个仓库。需要别的项目配合，报给主编排。

**不取消票。** 取消是人的决定。做不了就报 failed，让人看见。`,
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
