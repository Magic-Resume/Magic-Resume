<div align="center">
  <a href="https://magic-resume.cn">
    <img width="128" alt="Magic Resume" src="./apps/web/public/magic-resume-mark.png">
  </a>

  <h1>Magic Resume</h1>

  <p><strong>开源简历编辑器。</strong><br/>简历保存在本地；AI Lab 可接入自己的模型 Key 和后端。</p>

  <p>
    <a href="https://magic-resume.cn"><strong>立即开始 »</strong></a>
    &nbsp;·&nbsp;
    <a href="./README.md">English</a>
    &nbsp;·&nbsp;
    <a href="https://magic-resume.cn">官方网站</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/Magic-Resume/Magic-Resume/issues">问题反馈</a>
  </p>

  <!-- SHIELD GROUP -->

  [![][vercel-shield]][vercel-link]
  [![][github-stars-shield]][github-stars-link]
  [![][github-forks-shield]][github-forks-link]
  [![][github-contributors-shield]][github-contributors-link]
  [![][github-issues-shield]][github-issues-link]
  [![][github-license-shield]][github-license-link]

</div>

<br/>

![Banner](./apps/web/public/magic-resume-preview.png)

<br/>

**Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。** MIT 协议内核，20 套模板，六种工作模式（创建、优化、分析、翻译、面试、导出），多设备云同步。

> Magic Resume（magic-resume.cn）与 magicv.art 的 Magic Resume（魔方简历）是两个由不同团队维护的独立开源项目。

本仓库提供 MIT 协议的本地编辑器和 BYOK AI Lab。编辑与导出不需要账号或后端，简历和每份简历唯一的会话保存在 IndexedDB。主动使用 AI 时，消息、相关简历内容、附件和模型密钥会通过本应用发送到你部署的 AI 后端。云同步与托管 AI 由 [magic-resume.cn](https://magic-resume.cn) 提供。

## 开源版与 magic-resume.cn

编辑器和模板相同；托管版代为管理 AI 后端，并提供账号和多设备同步。

| | 开源版（本仓库） | magic-resume.cn |
|---|---|---|
| 授权 | MIT，永久免费 | 免费额度 + 付费计划 |
| 账号 | 不需要 | 需要 |
| 数据存储 | 仅本机浏览器 IndexedDB | 加密云端存储，随时完整导出 |
| 多设备同步 | 不支持 | 支持 |
| AI Lab | 自带 Key + 自部署兼容后端；不含面试或记忆 | 托管 AI、面试与记忆 |
| 后端 | 编辑无需后端；AI 后端需另行部署 | 官方托管 |
| 模板 | 20 套，完全相同 | 20 套，完全相同 |

> [!NOTE]
> 从 v3 起，本仓库移除了账号、云同步和计费。AI Lab 使用 BYOK 和可配置的后端入口；本仓库包含界面与代理，不包含后端实现。具体变化见 [CHANGELOG](./CHANGELOG.md)。

---

## 功能特性

- **实时预览**：边输入边按打印效果重新排版。
- **20 套模板**：适配 ATS，每套都可以调整配色、字体、间距和版式。
- **自定义模块**：新增、重命名、排序、隐藏模块，正文用 Tiptap 富文本编辑。
- **JSON 查看**：查看简历的原始数据并下载。
- **导入与导出**：本地导入 Magic Resume JSON，或用 AI 解析 PDF、Word、图片与 Markdown；导出为 PDF、PNG 或 JSON。
- **本地优先**：简历与会话保存在 IndexedDB；仅主动使用 AI 时向配置的后端发送内容，不发送统计数据。
- **浅色与深色主题，中英文界面。**

---

## 简历模板

20 套精心设计、适配 ATS 的模板，每一套都可以调整配色、字体、间距与版式：

`classic` · `azurill` · `bronzor` · `chikorita` · `ditto` · `gengar` · `orange-modern` · `clean-minimal` · `teal-professional` · `red-accent` · `golden-elegant` · `product-ops-focus` · `compact-cn-photo` · `executive-band` · `timeline-pro` · `skills-first` · `serif-minimal` · `slate-sidebar` · `cn-formal-photo` · `blue-line`

---

## 快速开始

```bash
git clone https://github.com/Magic-Resume/Magic-Resume.git
cd Magic-Resume
pnpm install
pnpm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。不需要 `.env` 文件；可选配置见 `apps/web/.env.example`。

---

## 自托管

编辑功能只需要一个 Next.js 服务。启用 AI 时需配置 `AI_BACKEND_URL` 并在「设置 → 模型」填写自己的 Key，后端需实现[接口契约](./docs/reference/ai-backend.md)。两种方式任选：

**Docker**

```bash
docker build -f apps/web/Dockerfile -t magic-resume .
docker run -p 3000:3000 magic-resume
```

**Vercel**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FMagic-Resume%2FMagic-Resume)

<details>
<summary><strong>环境变量（全部可选）</strong></summary>

<br/>

| 变量 | 默认值 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | 对外地址，用于 `robots.txt` 和页面元数据。 |
| `APP_PUBLIC_URL` | — | 同上，但在请求时读取，同一个镜像可以服务多个域名。 |
| `AI_BACKEND_URL` | — | 自部署 AI 后端地址，仅服务端读取；未配置时 AI 请求返回 503。 |
| `NEXT_PUBLIC_DOCS_URL` | — | 「帮助中心」菜单项的链接；不设置时隐藏该菜单项。 |

</details>

---

## MCP

`packages/mcp`（`@magic-resume/mcp`）是一个 Model Context Protocol 服务，让 AI 工具（Claude Code、Cursor、Windsurf）通过感知 schema 的 JSON Patch 读取和修改简历。它通过 API 连接 Magic Resume 账号，所以配合 magic-resume.cn 使用；本仓库的本地编辑器没有可供它连接的服务端。用法见 [docs/reference/mcp.md](./docs/reference/mcp.md)。

---

## 路线图

小型开源后端另行实现。目前已提供 BYOK 界面和 [HTTP/SSE 契约](./docs/reference/ai-backend.md)。普通模型 API 地址不能直接充当 AI_BACKEND_URL，后端还需要实现对话、工具和导入协议。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 单仓管理 | [Turborepo](https://turbo.build/)、[pnpm](https://pnpm.io/) |
| 框架 | [Next.js 16](https://nextjs.org/)（App Router、Turbopack） |
| 语言 | [TypeScript](https://www.typescriptlang.org/) |
| 样式 | [Tailwind CSS 4](https://tailwindcss.com/) |
| UI | [Radix UI](https://www.radix-ui.com/)、[React Aria](https://react-spectrum.adobe.com/react-aria/) |
| 动效 | [Framer Motion](https://www.framer.com/motion/) |
| 状态管理 | [Zustand](https://zustand-demo.pmnd.rs/) |
| 存储 | [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) |
| 编辑器 | [Tiptap](https://tiptap.dev/) |
| PDF | [React-PDF](https://react-pdf.org/)、[PDF.js](https://mozilla.github.io/pdf.js/) |
| Schema | [Zod](https://zod.dev/) |
| 国际化 | [i18next](https://www.i18next.com/) |

---

## 单仓结构

| 工作区 | 说明 |
|---|---|
| `apps/web` | 编辑器（Next.js） |
| `apps/landing` | magic-resume.cn 官网（Astro） |
| `apps/docs` | 文档站（Mintlify） |
| `packages/resume-schema` | 共享的 Zod schema、类型与示例数据 |
| `packages/resume-templates` | 模板 DSL、渲染器与注册表 |
| `packages/genui` | AI Lab 组件与卡片 |
| `packages/design-system` | 设计 token 与共享样式 |
| `packages/icons` | 图标集 |
| `packages/utils` | 小工具函数（`cn`、时间、颜色） |
| `packages/mcp` | `@magic-resume/mcp`，stdio MCP 服务与 CLI |
| `packages/tsconfig` | 共享 TypeScript 配置 |

```bash
pnpm install            # 安装全部依赖
pnpm run dev            # 启动全部工作区
pnpm run lint           # lint 与架构检查
pnpm run test           # 测试

# 只操作单个工作区
pnpm --filter @magic-resume/web dev
pnpm --filter @magic-resume/mcp build
```

---

## 参与贡献

欢迎任何形式的贡献 —— 修复 Bug、新增模板、完善文档、补充翻译或开发新功能。

请先阅读 **[贡献指南](./CONTRIBUTING.zh-CN.md)** —— 其中包含本地启动、分支流程，以及强制执行的 **gitmoji + Conventional Commits** 提交规范。若是 Bug 或新想法，也欢迎先开一个 [Issue](https://github.com/Magic-Resume/Magic-Resume/issues) 讨论。

<a href="https://github.com/Magic-Resume/Magic-Resume/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Magic-Resume/Magic-Resume" alt="contributors" />
</a>

---

## Star 趋势

<a href="https://star-history.com/#Magic-Resume/Magic-Resume&Date">
  <img src="https://api.star-history.com/svg?repos=Magic-Resume/Magic-Resume&type=Date" alt="Star History Chart" width="600" />
</a>

---

<div align="center">

版权所有 © 2026 [Magic Resume Team](https://github.com/Magic-Resume) · 基于 [MIT](./LICENSE) 许可证开源。

</div>

<!-- LINK GROUP -->

[official-site]: https://magic-resume.cn
[vercel-shield]: https://img.shields.io/badge/vercel-online-55b467?labelColor=black&logo=vercel&style=flat-square
[vercel-link]: https://magic-resume.cn
[github-contributors-shield]: https://img.shields.io/github/contributors/Magic-Resume/Magic-Resume?color=c4f042&labelColor=black&style=flat-square
[github-contributors-link]: https://github.com/Magic-Resume/Magic-Resume/graphs/contributors
[github-forks-shield]: https://img.shields.io/github/forks/Magic-Resume/Magic-Resume?color=8ae8ff&labelColor=black&style=flat-square
[github-forks-link]: https://github.com/Magic-Resume/Magic-Resume/network/members
[github-stars-shield]: https://img.shields.io/github/stars/Magic-Resume/Magic-Resume?color=ffcb47&labelColor=black&style=flat-square
[github-stars-link]: https://github.com/Magic-Resume/Magic-Resume/stargazers
[github-issues-shield]: https://img.shields.io/github/issues/Magic-Resume/Magic-Resume?color=ff80eb&labelColor=black&style=flat-square
[github-issues-link]: https://github.com/Magic-Resume/Magic-Resume/issues
[github-license-shield]: https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square
[github-license-link]: https://github.com/Magic-Resume/Magic-Resume/blob/master/LICENSE
