# DSH Nexus

> TODO: 该项目正在开发中，请谨慎使用。

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

为 DeepSeek Harness（DSH）提供多代理任务编排：把 GitHub / GitLab 的 issue、PR 与评论变成任务，按仓库交给专属 Worker，在独立 worktree 里改代码、跑测试、开 PR，再由上级代理验收收尾。

## 🧩 设计参考与架构差异

部分设计参考 DeepSeek 官方组织下的 [Superagent 原型](https://github.com/deepseek-ai/dsh-superagent-prototype)：

话题、触发、任务、执行会话与收件箱沿用了它的领域模型。我们在此基础上按多仓库长期编排重做了分层与状态归属。

| 维度 | 官方原型 | Nexus |
| --- | --- | --- |
| 编排层级 | 主 Session → 执行器两层 | 主编排 → 项目编排 → 执行会话，跨项目时另起临时协调者 |
| 适用范围 | 单个 GitHub 仓库 | 多个 Git 工作区，每项目一个编排，可记录跨项目依赖 |
| 授权模型 | Policy / Eval / Gate / Decision / Mandate 多级判定 | 机器人账号即被授权身份，判定过程不入库 |
| 消息投递 | TicketInput / UndeliveredInput / Outbox / DispositionFanout 多表协作 | 一张 `Inbox` 承担投递、升级与阻塞语义 |
| 需人工介入 | 独立的 Attention 概念 | 由指向该任务的 pending `ask` 派生，不覆盖任务自身状态 |
| 渠道 | GitHub 与飞书事件接入 | GitHub、GitLab 统一抽象，飞书待接入 |

这些删减与合并都有明确理由，逐条对照见[数据模型](prisma/README.md#相对官方删掉的概念)。

## 📦 安装

插件尚未发布到 npm，请从源码安装到 DSH 实例：

```sh
dsh plugin --profile <name> add github:omdsh-dev/dsh-nexus
```

- 默认使用独立 profile `nexus-dev` 与端口 `3091`，不影响正在使用的桌面 profile。
- `--once` 只构建一次、不进入 watch；`--no-open` 启动后不自动打开浏览器。
- 依赖的 DSH 包锁定在 `0.2.2-rc.2`，CI 在 Node 24 上针对 `0.2.2-rc.3` 校验。

## ✨ 特性

- 🧭 **四层代理**：主编排定归属、项目编排管执行、临时协调者处理跨项目依赖、执行会话真正改代码，各自持有独立工具集与提示词。
- 🔁 **任务闭环**：渠道事件落入话题，分诊后开票，派发到 Worker；Worker 报 `ready` 转 `review`，PR 与 CI 状态回写到票。
- 🌿 **一票一树**：分支固定为 `nexus/<任务号>`，worktree 建在仓库同级的 `.nexus-worktrees/` 下；分支末段必须等于任务号，PR 靠它回挂到票。
- 📥 **收件箱**：代理与人类共用一套投递规则，`ask` 只挂起当前工作线；失败按指数退避重试，超过阈值转为投递受阻并单独统计。
- 🔗 **多渠道**：GitHub、GitLab 每 30 秒轮询接收事件与 CI 结果，按仓库归属投递；飞书只留配置入口，尚未开放。
- 🖥️ **面板**：DSH Web GUI 内置概览、任务、触发、渠道、设置五个分区，并可一键打开主编排会话。
- 🗄️ **本地存储**：SQLite 经 Kysely 访问，迁移由 Prisma schema 生成；轻量会话与设置状态存在 `$DSH_HOME/.nexus/storage.json`。

## 🚀 快速开始

1. 运行 `pnpm run dev:dsh`，DSH 会在 `http://127.0.0.1:3091` 启动。
2. 打开 **Nexus** 面板，在设置页刷新项目列表并勾选要参与编排的 Git 工作区。
3. 在渠道页配置 GitHub / GitLab 的账号、Token 与 Git 提交身份。
4. 点击「打开主会话」进入主编排，在 issue 或 PR 中 @ 机器人即可开始分诊。

## 📚 文档

- [跨代理流程](docs/flow.md)：分诊、任务生命周期、汇报与升级、PR 与 CI 的完整规则。
- [代理与工具矩阵](docs/agents/README.md)：四个代理的职责边界与工具分配。
- [数据模型](prisma/README.md)：表结构、收件箱语义与项目发现范围。
- [开发规范](docs/specs/devlopment.md)：目录归属、副作用与通信约束。

## 🛠️ 开发与贡献

```sh
pnpm run lint --fix
pnpm run typecheck
pnpm run test -- --run
pnpm run test:e2e
```

数据库结构位于 `prisma/schema/`，改动后执行 `pnpm run prisma:generate` ，将由迁移脚本生成。

E2E 需要本机 Playwright Chromium，并把 `DSH_E2E_CLI` 设为已安装的 `@deepseek-ai/dsh/lib/bin.js` 绝对路径。

## 🚧 当前限制

- 自动合并 PR 默认关闭，授权流程尚未完成，暂不可开启。
- 收件箱没有超时自动升级，升级需要代理显式调用 `escalate`。
- PR 合并或关闭后回写状态并通知项目编排，项目编排仍需自行收尾，插件不会自动结单。
- 飞书渠道只保留配置入口，不接收真实消息。
- 版本仍为 `0.0.0`，接口、数据结构与代理提示词都可能变动。

## 📜 许可证

[Apache-2.0](./LICENSE) License © [Oh My DSH](https://github.com/omdsh-dev)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/dsh-nexus?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmx.dev/package/dsh-nexus
[npm-downloads-src]: https://img.shields.io/npm/dm/dsh-nexus?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmx.dev/package/dsh-nexus
[bundle-src]: https://img.shields.io/bundlephobia/minzip/dsh-nexus?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=dsh-nexus
[license-src]: https://img.shields.io/github/license/omdsh-dev/dsh-nexus.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/omdsh-dev/dsh-nexus/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/dsh-nexus
