---
title: 公共包接入
type: reference
status: Living
owner: kaihuang
created: 2026-10-25
updated: 2026-10-25
summary: 本仓库依赖 magic-resume-kit 的哪些公共包、版本怎么固定与升级、怎么对着本地 kit 联调。
scope: ["@magic-resume-kit/*", apps/web, apps/landing, packages/genui]
repos: [Magic-Resume, magic-resume-kit]
related: [reference/mcp, architecture/overview]
---

# 公共包接入

简历的 schema、模板、设计系统、图标、工具函数和 MCP 由 [magic-resume-kit](https://github.com/Magic-Resume/magic-resume-kit) 维护，以 `@magic-resume-kit/*` 发布到 npmjs。本仓库只消费发布版本，不再保存这些包的源码。

## 谁用了哪些包

| 使用方 | 公共依赖 |
| --- | --- |
| `apps/web`（编辑器） | resume-schema、resume-templates、design-system、icons、utils |
| `apps/landing`（官网） | resume-schema、resume-templates、design-system |
| `packages/genui` | design-system、icons、utils |
| 根目录检查脚本 | resume-schema、design-system |

`@magic-resume-kit/mcp` 是给终端用户单独安装的 MCP 客户端，不是编辑器的运行时依赖，所以这里没有它。

留在本仓库的：`packages/genui`、`packages/tsconfig`、PDF 字体（`apps/web/public/fonts`，模板按 `${location.origin}/fonts/...` 读取）和 `@react-pdf/*` 补丁（`patches/`，版本由 `pnpm-workspace.yaml` 的 `overrides` 固定，与模板包一致）。

## 版本

- `package.json` 里写**精确版本**（不带 `^`），每次升级在 diff 里一眼可见。
- Tailwind 从已安装的包里扫描类名：`apps/web/src/app/globals.css` 和 `apps/landing/src/styles/global.css` 用 `@source` 指向带样式的那几个包的 `dist`（目前是 resume-templates 和 design-system）。哪个包开始输出 Tailwind 类名，就要在这里加一行；漏掉不会报错，只会静默丢样式。
- `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 豁免了 `@magic-resume-kit/*`，刚发布的版本可以立即安装。

## 升级

kit 发版后会向本仓库发 `repository_dispatch`，由 `.github/workflows/bump-magic-packages.yml` 把依赖改成刚发布的确切版本，并向当天的 `release-*` 分支开或更新一个 PR；也可以手动触发，或等每周一次的兜底运行。

- 工作流只在仓库变量 `PUBLIC_PACKAGES_UPDATES_ENABLED` 为 `true` 时运行，并需要 release-bot App（`RELEASE_BOT_APP_ID` / `RELEASE_BOT_PRIVATE_KEY`）开 PR。
- 只含 patch / minor 的 PR 在 CI 通过后可以自动合并；含 major 的会停下，等人改代码。

手动升级：

```bash
pnpm up -r --latest "@magic-resume-kit/*"
```

## 对着本地 kit 联调

改模板或 schema 时，在发版前先在应用里验证：

1. 在 kit 仓执行 `pnpm check:packages`，`.artifacts` 下会生成六个包的 tarball 和清单。
2. 在本仓库的**临时副本**里用 `pnpm-workspace.yaml` 的 `overrides` 把对应包指向这些 tarball（`file:/path/to/pkg.tgz`），`pnpm install` 后跑构建和测试。kit 的 `docs/consumer-migration.md` 有完整步骤。
3. 验证通过后在 kit 发版，再让升级工作流（或手动 `pnpm up`）把正式版本带进来。

不要把指向本地文件的 `overrides` 提交进仓库。
