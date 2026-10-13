# 自动创建 release PR

`Open release pull request` 在 `release-*` 分支收到 push（包括合并功能 PR）时运行。
它读取仓库的默认分支（Core 为 `main`，Web/Admin 为 `master`），有实际差异时创建
release → 主干的普通 PR。同一来源/目标已有开放 PR 时直接复用，保留人工编辑的标题、
说明和审核。已有 PR 会随 release 分支更新，不需要机器人再次写入。

无新增提交、内容相同或分支已删除时跳过。每个 release 分支串行运行，创建前再次查询，
并处理并发创建产生的 422。没有定时任务、依赖安装、项目构建、自动批准或自动合并。

## 认证

安装现有 `magic-resume-release-bot`，配置仓库变量 `RELEASE_BOT_APP_ID` 与仓库密钥
`RELEASE_BOT_PRIVATE_KEY`。App 需具备 Contents: read、Pull requests: write。
任务只在需要创建时签发当前仓库的短期 token，并进一步限制到上述权限。
只读规划使用 `GITHUB_TOKEN`；创建 PR 使用 App token，以便正常触发 PR 检查，
同时兼容组织禁止 `GITHUB_TOKEN` 创建 PR 的策略。缺少配置会明确失败，不静默退回其他 token。

代码来自默认分支的 `.github/release-pr`，不会执行 release 分支中的应用代码。
首次合并本功能后，从最新主干创建的新 release 分支会继承触发器；已存在的 release
分支需同步主干中的 workflow 才能接收后续 push 事件。补开现有分支的 PR 可在主干上手动运行：

```sh
gh workflow run auto-release-pr.yml --ref main -f release_branch=release-2026-10-13
# Web/Admin 使用 --ref master；CLI 在对应仓库目录运行，或显式指定 --repo。
```

## 审核与合并

建议 Rebase and merge 保留功能提交，尤其 Web 的 semantic-release 依赖 gitmoji。
如果选择 squash，合并者需核对最终提交标题中的发版语义；自动化不修改既有 PR 标题。
Admin 发布 PR 会提醒先部署对应 Core 版本。

## 验证

```sh
node --test .github/release-pr/ensure-release-pr.test.cjs
```

测试覆盖 main/master、已有 PR、空差异、squash 后相同内容、删除分支、非法分支名、
权限失败以及创建竞态，并接入仓库既有的 PR 检查任务，无需额外的 CI job。
