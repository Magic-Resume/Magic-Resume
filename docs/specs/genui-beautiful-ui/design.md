---
title: 用 Beautiful UI 重写 GenUI 交互层
type: spec
status: Draft
owner: kaihuang
created: 2026-08-12
updated: 2026-08-12
summary: 引入 beautifului.dev 的 19 个 AI 原生交互组件，替换并扩充 GenUI 的对话、审批、任务、输入等交互面。
scope: [apps/web, packages/genui]
repos: [Magic-Resume]
related: [specs/genui-systematization, specs/ai-lab-living-canvas, specs/ai-composer-refit, specs/ai-working-motion, specs/light-theme]
---

# 用 Beautiful UI 重写 GenUI 交互层

## 1. 背景

`beautifului.dev` 是设计工作室 Turbo（`turbodesign.co`）的单页展示站，收录 19 个 AI 原生交互组件：思考过程、流式正文、工具芯片、任务行、审批卡、输入条、选区操作等。它们的形态与我们 AI Lab 正在做的事高度重合，且完成度更高。

**许可状态**：站上没有 GitHub、没有文档、没有 license、没有条款，唯一的行动号召是 Cal.com 的「Book a call」。「copy-paste ready」是页面上的宣传语，不是许可声明。这一点已提出并由 owner 拍板直接使用，记录在此不再讨论。

**源码获取方式**（值得记下来，因为不显然）：源码不在 HTML 明文里，也不在 JS chunk 里，而是在 Next.js 的 **RSC 载荷**里，以长度前缀文本块（`<ref>:T<hex长度>,<内容>`）形式转义存放。19 个组件、184KB。

## 2. 三条决定做法的事实

### 2.1 零新依赖

不用 framer-motion、不用 lucide、不用 Radix —— 纯 React `useState/useEffect` + Tailwind + 手写 inline SVG。`apps/web` 已有 Tailwind v4，直接兼容。

### 2.2 接入成本集中在一层设计令牌

他们用了 **33 个语义令牌、334 处引用**：

| 他们 | 概念 | 我们已有 |
|---|---|---|
| `ink` / `ink-2` / `ink-3` | 文字三档 | 散在 `text-neutral-*` |
| `surface` / `inset` / `hover` / `hover-2` / `field` | 面与交互态 | `--surface-paper/sunk/raised/desk` |
| `line` / `line-strong` | 分隔线两档 | 散在 `border-neutral-*` |
| `accent` / `accent-tint` / `accent-ink` | 强调色三件套 | `--ink-sky` 系 |
| `shadow-hairline/card/raised/btn` | 四档阴影 | 无 |

概念一一对得上，命名不同。**所以是加一层别名，不是去改那 334 处 class。**

### 2.3 它们是自演示组件，不是数据驱动组件

`TaskRows` 内置一个自己跑的 `tick` 定时器把脚本演一遍；`ApprovalCard` 内置写死的 `QUESTIONS` 数组。

**这是本次真正的工作量**：每个组件都要把假数据剥出来、把 props 面定义出来、接上真实事件流。「copy-paste ready」对展示页成立，对产品不成立。

## 3. 令牌别名层（一切的前提，先做）

`apps/web/src/app/globals.css` 的 `@theme` 里补一组 `--color-*`，把他们的语义名映射到既有变量：

```css
@theme {
  --color-ink:     var(--text-primary);
  --color-ink-2:   var(--text-secondary);
  --color-ink-3:   var(--text-tertiary);
  --color-surface: var(--surface-paper);
  --color-inset:   var(--surface-sunk);
  --color-hover:   var(--surface-raised);
  --color-line:    var(--border-subtle);
  --color-accent:  var(--ink-sky);
  /* shadow-hairline / card / raised / btn 我们没有，新建 */
}
```

**为什么是别名而不是改 class**：一个文件几十行，19 个组件同时正确；他们出新版本可以整段替换而不必重做适配；而且**可逆**——映射错了改一行，不是回滚 334 处。

**深浅色白送**：别名指向的是既有主题变量，所以浅色主题（见 `specs/light-theme`）自动跟着走。这也是不硬编码颜色的额外收益。

## 4. 组件产品化：从 demo 到数据驱动

19 个统一进 `packages/genui/src/beautiful/`，每个走同一套处理：

1. **剥假数据**：内置的 `QUESTIONS` / 脚本 `tick` / 写死数组 → 提成 props
2. **定 props 面**：与 `packages/genui/src/contract` 的 `WidgetInstance` 契约对齐
3. **去掉自演示定时器**：状态由外部数据驱动，不再自己演
4. **保留原实现的动效与结构** —— 这正是我们要的东西，不重写

**保留一份未改动的原件**在 `packages/genui/src/beautiful/_vendor/`（不进构建），做升级对比用。改过的和原版混在一起，下次就分不清哪些是我们的改动。

### 4.1 分批（按 AI Lab 里有没有落点排序）

| 批次 | 组件 | 落点 |
|---|---|---|
| **A** | TaskRows、ToolChips、ApprovalCard、LoadingState | 替换现有（见 §5） |
| **B** | ThinkingState、StreamingText、ContextCards、RecommendationCard、CodeBlock | 对话流：思考过程、流式正文、RAG 来源、建议、代码 |
| **C** | PromptBar、SelectionActions、SearchList | 输入区与选区操作。PromptBar 29KB 是最大的一个，要与现有 Composer 的语音 / 模式轴合并 |
| **D** | DiffTable、InsightCards、RecordsTable、FilterTable、SidebarNav、FineTuneCard、ChatComposer | **存货：只入库，不接线、不进 registry** |

D 批要在 `packages/genui/README` 里写明「已入库未接线」——否则下一个人会以为它们在跑。

## 5. 四个已做的怎么换（有两件必须移植，不能直接丢）

**他们的 TaskRows 用 `grid-template-rows` + `cubic-bezier(0.23,1,0.32,1)` 做展开收起 —— 正是上一轮被否掉的那个做法。**

我们现在的 `useSpringHeight` 是临界阻尼弹簧积分器，依据是对参照产品的逐帧实测（高度增量 6,3,2,2,2,2、单调衰减、从不冲过头），而且**速度可继承**：任务行成串到达时，CSS transition 每次从零速度重启，看起来一顿一顿。

所以换的时候，这两件从我们这版移植进他们的结构：

1. **`useSpringHeight`** 替掉他们的 `transition-[grid-template-rows]`
2. **按 `activity` 切换的 `ActivityOrb`** 替掉他们的静态状态图元 —— 每行的形态由 agent 声明（`todo.activity`，后端从 `[[kind:label]]` 派生），他们的 demo 里没有这个概念

其余（结构、芯片样式、划线、折叠交互、完成态）用他们的。

**`ApprovalCard` 另有一处要对齐**：他们的是**多问题分页**（一次一问、进度胶囊、循环箭头推进），我们现有的是单问题。分页形态更好，但要对上 `interruptSlot` 的多决策契约 —— 一个中断可以带多个动作，后端会拒绝决策数量不匹配的续跑。

## 6. 验证

- `pnpm --filter @magic-resume/web build` / `lint` / `i18n:check`
  - **组件里全是英文写死文案，接线时必须走 `t()`。`i18n-check` 的 CJK 规则拦不住英文 —— 这条要人工过一遍。**
- `app.test.ts` 现有的 `testTasksCard`（判据 + segments 降级）**必须继续通过**，那是「换实现不换行为」的证据
- 令牌别名层：深浅色各截一次图，确认 19 个组件在两个主题下都不是透明 / 纯黑
- **视觉终验交 owner**：起 dev server 后逐批看。A 批重点看「连着追加几行时高度是否连贯」—— 那是弹簧有没有移植成功的判据
- D 批只验证「能构建、不进 registry、不影响包体积」

## 7. 关键文件

- `apps/web/src/app/globals.css`（令牌别名层，先做）
- `packages/genui/src/beautiful/`（19 个组件 + `_vendor/` 原件）
- `packages/genui/src/contract/`（props 面对齐）
- `apps/web/src/app/dashboard/edit/_components/ai/conversation/{TasksCard,useSpringHeight,ChatThread,Composer}.tsx`
- `apps/web/src/app/dashboard/edit/_components/ai/widgets/registry.ts`
  - 新 kind 注册后，**Core 侧 `push-ui.tool.ts` 的描述要同步扩** —— 否则 agent 不知道自己能推什么。今天那份描述里只写死了 `suggestion_rail` 和 `template_gallery` 两种。
