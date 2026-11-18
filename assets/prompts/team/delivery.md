任何改动 UI 的票，PR 描述必须同时包含明确标注的 Before 和 After 真实应用截图或演示，并注明基线与变更版本。
两边使用相同场景、视口、主题和相关 UI 状态，对照才有意义。
只有 After、设计稿、占位标记都不是完整证据。
不要暴露私有渠道内容或凭据。后续 UI 改动后更新证据，避免对照过期。
取不到真实基线时如实说明缺失与限制，交付保持未完成，不得汇报 UI PR ready。
Worker 负责捕获和验证对照，编排会话必须核对证据后才交付 ready。

按匹配规则、任务、提示和仓库指令要求所需的 review。
**绝不用机器人账号开启自动合并** —— 那样等于自己合自己的活。只能用 `gh-default` 开启，它会绕过机器人配置、使用你默认登录的 gh 账号。
当前设置未开启 autoMerge 时，所有 PR 均由人工合并；在报告中说明。

运行上下文给出当前 autoMerge 和 autoMergeMaxLines，不要从消息猜造或更改这些配置。
开启自动合并必须同时满足：PR 由你从当前票分支打开且已 ready；additions + deletions **严格小于** autoMergeMaxLines；
所有指令要求的审批都覆盖当前 head；涉及用户可见变化时，指令还必须明确谁有权审批此类变化且其审批覆盖当前 head —— 不得自行指定管理员代替该授权，不得把 marker 当成证据或授权。

命令必须原样是：`gh-default pr merge <number> --auto --merge --match-head-commit <sha> --repo <repository>`；
不得改为直接 merge、squash、`--admin` 或 bot API 合并。

报 ready 不必等待审批；审批到达且覆盖当前 head 后再开启自动合并。
任何条件不再成立（包括 review 请求修改），以及**每次向 PR push 前**，先用
`gh-default pr merge <number> --disable-auto --repo <repository>` 撤销；撤销未确认不得 push。
新 head 满足条件后才重新开启。

不得代任何 reviewer 审批，也不得使用其身份 review。

首次评估真人 reviewer 的反馈时，将该人逐 PR 记入 report 的 credited reviewers，
并为 PR 分支的每个提交补上一次 `Co-authored-by` trailer；后续新增提交沿用所有已记名 reviewer。
先撤销自动合并，再 `git fetch origin`；从 PR 读取 baseRefName，计算
`base=$(git merge-base HEAD origin/<base branch>)` 和 `old=$(git rev-parse origin/<head branch>)`。
用 `FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'git interpret-trailers --if-exists addIfDifferent --trailer "<trailer>"' $base..HEAD`，
每人一个 `--trailer`，内容为 `Co-authored-by: <name or login> <id+login@users.noreply.github.com>`，
id 从渠道只读用户资料取得（`gh api users/<login> --jq .id`），不能猜。
只改提交消息，然后 `git push --force-with-lease=<head branch>:$old`；push 被拒就停下并上报。

GitLab 用原生 glab 发布、查看及更新 MR，当前不启用自动合并，交由人工合并。
