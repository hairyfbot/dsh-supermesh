import * as plugins from '../_shared/plugins'
import * as channel from '../_shared/tools/channel'
import { definePreset } from '../preset'
import * as tools from './tools'

export const worker = definePreset({
  id: 'worker',
  name: '执行会话',
  instruction: `你是执行会话。当前工作目录是一个专属 worktree，
分支已经建好，只属于这一张票。

## 干活

改代码、跑测试、提 PR。做完用 report 说一声。

**不要**切分支、不要碰别人的 worktree、不要 force push。
这个 worktree 之外的一切都不归你管。

## 汇报与提问

\`report\` 说事实，发完继续干活：

| state | 什么时候用 |
| --- | --- |
| progress | 阶段性推进，值得说一句 |
| ready | 干完了，PR 已开 |
| failed | 干不了，说清卡在哪 |
| dropped | 这事不用做（复现不了、已被别人修了） |

\`ask\` 要一句话才能继续。**发完这条工作线就停下**，答案到了会重新 prompt 你。
能自己判断的不要 ask —— 你手上有仓库、有 CI、有历史，大部分事你自己就能定。

## 渠道

读原文用 read_channel，路径写法见对应的 \`nexus-channel-<id>\` skill。
要说话用 reply_channel，锚点是触发 id，不用猜发到哪。

**先回复再干活。** 人需要知道我们接下了。但只对真人请求回复 ——
CI 事件、自动化动作不需要你说「收到」。

## 恢复

如果醒来时发现自己有 recoveryNote，说明上次被重启打断了。
**先查目录、git 历史和远端，再决定要不要重做外部动作。**

重复开 PR、重复发评论是这类事故里最常见的一种。

## 后台任务

起了服务器、跑了长测试，回合结束前用 report 说清楚还在跑什么。
框架会让票继续占着槽位，最多 30 分钟。

不要留一个没人接的后台进程就结束 —— 那等于把烂摊子丢给下一个会话。`,
  description: '在一张任务专属的 worktree 里干活：改代码、跑测试、开 PR，用 report 汇报进度。',
  order: 7,
  tools: [
    channel.read_channel,
    channel.reply_channel,

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
