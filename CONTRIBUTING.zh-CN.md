# 为 Magic Resume 做贡献

感谢你有兴趣参与贡献！我们欢迎任何形式的贡献 —— 修复 Bug、新增模板、编写 Polaris 技能、完善文档、补充翻译或开发新功能。

[English](./CONTRIBUTING.md) · **简体中文**

---

## 贡献方式

- **反馈 Bug 或提功能建议** —— 开一个 [Issue](https://github.com/Magic-Resume/Magic-Resume/issues)。
- **修复 Bug** 或 **开发功能** —— 提交 Pull Request。
- **新增模板** —— 模板在 magic-resume-kit 仓库的 [`packages/resume-templates`](https://github.com/Magic-Resume/magic-resume-kit/tree/main/packages/resume-templates)。
- **编写或改进 Polaris 技能** —— 参见 [Polaris 与 agent](#polaris-与-agent)。
- **完善翻译** —— 参见 [翻译](#翻译)。
- **改进文档** —— 包括本文件与 README。

对于较大的改动，建议先开 Issue 讨论方案，能为双方省下不少时间。

---

## 环境要求

- **Node.js** `>= 22.13`
- **pnpm** `>= 10.28.1`（本仓库通过 `packageManager` 锁定 `pnpm@10.28.1`）

## 本地启动

编辑器完全在浏览器中运行，不需要数据库，也不需要 `.env` 文件。只有 Polaris 需要 `apps/agent` 里的 agent，`pnpm run dev` 会一起启动它。

```bash
# 1. Fork 后克隆你的 fork
git clone https://github.com/<你>/Magic-Resume.git
cd Magic-Resume

# 2. 安装并运行
pnpm install
pnpm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。要使用 Polaris，把 `apps/web/.env.example` 复制为 `apps/web/.env.local`，取消 `AI_BACKEND_URL=http://localhost:4000` 的注释后重启，再到 **设置 → 模型** 填写你的模型 Key。仓库结构见 [README](./README.zh-CN.md#仓库结构)。

---

## 开发流程

1. 基于 `master` 新建分支：

   ```bash
   git checkout -b feat/your-thing   # 或 fix/…、docs/…、refactor/…
   ```

2. 完成改动，保持聚焦 —— 一个 PR 只做一件事。

3. 提交前确保检查通过：

   ```bash
   pnpm run lint
   pnpm run test
   pnpm --filter @magic-resume/agent typecheck   # 改动 apps/agent 时
   ```

   > `pre-commit` 钩子还会自动跑 `lint` + `build`。请勿用 `--no-verify` 绕过。

---

## 提交规范

本仓库通过 `commitlint` 钩子（`commitlint-config-gitmoji`）强制 **gitmoji + [Conventional Commits](https://www.conventionalcommits.org/)**。不合规的信息会被**拒绝**。

### 格式

```
<emoji> <type>(<scope>?): <subject>
```

- **emoji** —— gitmoji 短码（`:sparkles:`）或 unicode 字符（✨），须为 [gitmoji.dev](https://gitmoji.dev) 中的有效代码。
- **type** —— 以下之一：`build · ci · chore · docs · feat · fix · perf · refactor · revert · style · test · wip`（小写）。
- **scope** —— 可选，小写工作区名：`web`、`agent`、`genui`、`landing`、`docs`。schema、模板、设计系统和 MCP 的改动请提交到 [magic-resume-kit](https://github.com/Magic-Resume/magic-resume-kit)。
- **subject** —— 祈使语气（"add"，而非 "added"），结尾不加句号，整个 header ≤ 100 字符。

正文与 footer 可选；如有，各需以空行分隔。

### emoji → 意图（常用）

| 意图 | Emoji | 类型 |
|---|---|---|
| 新功能 | `:sparkles:` ✨ | `feat` |
| 修复 Bug | `:bug:` 🐛 | `fix` |
| 文档 | `:memo:` 📝 | `docs` |
| 重构 | `:recycle:` ♻️ | `refactor` |
| 性能 | `:zap:` ⚡️ | `perf` |
| UI / 样式 | `:lipstick:` 💄 | `style` |
| 代码格式 / 结构 | `:art:` 🎨 | `style` |
| 测试 | `:white_check_mark:` ✅ | `test` |
| 配置 / 工具 | `:wrench:` 🔧 | `chore` |
| 升级依赖 | `:arrow_up:` ⬆️ | `chore` |
| 删除代码 / 文件 | `:fire:` 🔥 | `chore`、`refactor` |
| 国际化 | `:globe_with_meridians:` 🌐 | `feat` |

完整列表见 [gitmoji.dev](https://gitmoji.dev)。

### 示例

```bash
# ✅ 通过
:sparkles: feat(web): add resume share link generator
:bug: fix(agent): keep item ids when translating a resume
:memo: docs: rewrite contributing guide

# ❌ 不通过
feat: add dark mode                 # 缺 emoji
:sparkles: Feat: add dark mode      # type 必须小写
:sparkles: feat: add dark mode.     # 结尾多了句号
```

### 提交前自查一条信息

```bash
echo ":sparkles: feat(web): add resume share link generator" | npx --no -- commitlint
```

退出码 `0` 即合规；非零会打印出未通过的规则。

---

## Polaris 与 agent

`apps/agent` 是 Polaris 背后的服务。架构见 [docs/specs/agent-backend/design.md](./docs/specs/agent-backend/design.md)，编辑器与 agent 之间的协议见 [docs/reference/ai-backend.md](./docs/reference/ai-backend.md)。两边要一起改：新增的事件或字段必须在编辑器里能用，并写进协议文档。

- **技能** 是 `apps/agent/skills/<name>/SKILL.md` 里的 Markdown，可以附带 `references/` 和 `assets/`。frontmatter 里的 `allowed-tools` 会被强制执行，技能用到的每个工具都要列出来。指令保持通用；示例不要使用真人信息，用明显虚构的姓名和 `example.com` 地址。
- **测试** 使用 Node 自带的测试运行器和一个假的 OpenAI 兼容服务，不需要 API Key：`pnpm --filter @magic-resume/agent test`。只要改动了 agent 输出的事件或保存的内容，就补一条场景测试。
- **用真实模型试跑**：步骤见 `apps/agent/README.md`，任何 OpenAI 兼容接口都可以。模型服务在本机时，启动 agent 加上 `AGENT_ALLOW_PRIVATE_MODEL_HOSTS=true`。
- **不要记录或保存模型 Key**，问答模式下不要让简历进入模型请求。代码评审会检查这两点。

---

## 翻译

前端使用 [i18next](https://www.i18next.com/)，翻译文件位于 `apps/web/src/locales/`。修改后请校验 key 是否对齐：

```bash
pnpm --filter @magic-resume/web i18n:check
```

---

## PR 流程

1. 推送分支，向 `master` 发起 [Pull Request](https://github.com/Magic-Resume/Magic-Resume/pulls)。
2. 写清标题（可参照提交规范），说明**改了什么**、**为什么改**。
3. 关联相关 Issue（如 `Closes #123`）。
4. 确保 CI、lint 与测试全绿。

维护者会尽快 Review。感谢你让 Magic Resume 变得更好！🎉

---

## 许可证

提交贡献即代表你同意你的贡献将以 [MIT 许可证](./LICENSE) 授权。
