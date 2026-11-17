# DSH Nexus

> TODO: 该项目正在开发中，请谨慎使用。

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

DSH 多代理任务编排：把 GitHub / GitLab 的 issue、PR 与评论变成任务，交给各自 worktree 里的 Worker 改代码、开 PR，再由上级代理验收收尾。

## 🧩 设计参考

部分设计参考官方 [Superagent 原型](https://github.com/deepseek-ai/dsh-superagent-prototype)的领域模型（话题、触发、任务、执行会话、收件箱），并按多仓库长期编排重做了分层与状态归属。

| 维度 | 官方原型 | Nexus |
| --- | --- | --- |
| 编排层级 | 主 Session → 执行器 | 主编排 → 项目编排 → 执行会话，跨项目另起协调者 |
| 适用范围 | 单个 GitHub 仓库 | 多工作区，每项目一个编排，可记录跨项目依赖 |
| 授权模型 | Policy / Eval / Gate / Decision / Mandate | 机器人账号即授权身份，判定不入库 |
| 消息投递 | 四张表协作 | 一张 `Inbox` |
| 需人工介入 | 独立 Attention | pending `ask` 派生，不覆盖任务状态 |
| 渠道 | GitHub、飞书 | GitHub、GitLab，飞书待接入 |

取舍理由见[数据模型](prisma/README.md#相对官方删掉的概念)。

## 📦 安装

```sh
dsh plugin --profile <name> add github:omdsh-dev/dsh-nexus
```

需要 DSH `0.2.2-rc.2`。本地开发用 `pnpm run dev:dsh`，默认 `nexus-dev` profile 与 `3091` 端口。

## ✨ 特性

- 🧭 **四层代理**：主编排定归属、项目编排管执行、临时协调者处理跨项目、执行会话改代码，各有独立工具与提示词。
- 🔁 **任务闭环**：事件 → 话题 → 分诊开票 → Worker；`ready` 转 review，PR 与 CI 状态回写到票。
- 🌿 **一票一树**：分支 `nexus/<任务号>`，worktree 在仓库同级 `.nexus-worktrees/`，PR 靠分支名回挂。
- 📥 **收件箱**：代理与人类共用投递规则，`ask` 只挂起当前工作线，失败指数退避并单独记受阻。
- 🔗 **多渠道**：GitHub、GitLab 每 30 秒轮询事件与 CI，按仓库归属投递。
- 🖥️ **面板**：概览、任务、触发、渠道、设置五个分区，可一键进入主编排。
- 🗄️ **本地存储**：SQLite + Kysely，迁移由 Prisma schema 生成。

## 🚀 快速开始

1. 打开 **Nexus** 面板，在设置页勾选要参与的 Git 工作区。
2. 在渠道页配置 GitHub / GitLab 账号与提交身份。
3. 点「打开主会话」进入主编排，在 issue 或 PR 中 @ 机器人开始分诊。

## 📚 文档

- [跨代理流程](docs/flow.md)：分诊、任务生命周期、汇报升级、PR 与 CI。
- [代理与工具矩阵](docs/agents/README.md)：职责边界与工具分配。
- [数据模型](prisma/README.md)：表结构与收件箱语义。
- [开发规范](docs/specs/devlopment.md)：目录归属与副作用约束。

## 🛠️ 开发

```sh
pnpm run lint --fix
pnpm run typecheck
pnpm run test -- --run
pnpm run test:e2e
```

改 `prisma/schema/` 后跑 `pnpm run prisma:generate`，迁移由 `pnpm run prisma:migrate` 生成。E2E 需 Playwright Chromium，并把 `DSH_E2E_CLI` 指向 `@deepseek-ai/dsh/lib/bin.js`。

## 🚧 当前限制

- 自动合并 PR 未完成授权，暂不可开启。
- 收件箱无超时自动升级，需代理显式 `escalate`。
- PR 合并后只回写状态并通知编排，不会自动结单。
- 飞书仅有配置入口。
- 版本 `0.0.0`，接口与提示词仍可能变动。

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
