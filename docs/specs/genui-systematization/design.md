---
title: GenUI Systematization
type: spec
status: Draft
owner: kaihuang
created: 2026-07-03
updated: 2026-08-09
summary: Package boundary and widget contract for rendering typed interactive assistant output.
scope: [packages/genui, apps/web]
repos: [Magic-Resume]
related: [reference/agent-tool-approval-contract, specs/ai-lab-living-canvas, specs/frontend-v2-backend-integration, specs/ai-working-motion]
---

# GenUI Systematization

> 本文只描述前端如何把结构化 assistant 输出渲染成交互组件。生成、推送和后端执行机制不在前端公开仓记录。

## 目标

- LLM 不只输出文本，也能触发类型安全的 UI widget。
- 每个 widget 都有明确 schema、渲染组件、提交/取消事件。
- 一个坏 widget 不能破坏整条对话。
- UI 组件只处理显示和用户交互，业务决策走 shell/service 层。

## 包边界

组件库是独立 workspace 包 `@magic-resume/genui`（`packages/genui`）：**包管「怎么显示和交互」，app 管「显示什么」**。

```
packages/genui/src/
  contract/   契约类型
  host/       WidgetHost（注册表分发 + normalize + 安全兜底）
  motion/     动效 token / variants / WidgetShell
  widgets/    通用交互卡片
```

留在 `apps/web`：widget 注册表（哪些 kind 存在、各自的字段定义）、数据源、以及把用户操作送回 agent 的传输层。这些是应用与自己 agent 之间的业务契约，进了包就把包污染成业务包。

消费方要提供两样东西，缺了都不报错、只是静默出错：

- **主题 token**：组件用语义工具类（`bg-raised` / `text-primary` / `text-ink-sky` …），由 app 的 `@theme inline` 定义，卡片才跟随明暗主题。
- **Tailwind 源扫描**：`globals.css` 里必须有 `@source "…/packages/genui/src"`。Tailwind v4 从构建 cwd 自动探测、不扫 workspace 包，漏了只会缺样式。

## Widget Contract

```ts
type WidgetInstance = {
  widgetId: string;   // upsert key
  kind: string;       // 注册表键；中断路径上等于工具名
  props: Record<string, unknown>;
  status: 'pending' | 'submitted' | 'cancelled';
};
```

前端要求：

- `kind` 必须命中注册表。
- `props` 通过 `normalize` 校验后才渲染。
- 不认识的 widget 渲染为安全 fallback。
- widget 事件向上抛出语义化 action，不直接请求后端。

## 两条到达路径

| 路径 | 语义 | 用在哪 |
|---|---|---|
| 中断 | 运行暂停，等用户答完才继续 | 表单、选择、确认 |
| 非阻塞推送 | 流不停，同 `widgetId` 再推是更新同一张卡 | 进度、结果卡、建议轨 |

## 结果去向

`WidgetDescriptor.interaction` 决定用户操作后结果送到哪：

- `resume` —— 答复暂停的运行。**一次暂停可能挂着多个动作，裁决数必须与动作数相等**，所以每张卡记住自己答的是哪个槽，全答完才一起送出。
- `message` —— 折成一条用户消息发出。
- `client` —— 就地生效，不回后端（挑模板这类）。

## 动效

卡片动效不自成一套，挂进既有的「一个心跳」动效语言（`specs/ai-working-motion`）：统一的进入/退出曲线、按重要性分配的时长、`WidgetShell` 统一负责入场/落定/收起，并在 `prefers-reduced-motion` 下退化为纯 opacity。

## HITL Integration

授权卡也是一种会话内交互组件，但它承载的是用户许可，不展示内部工具名或后端实现。详见 [Agent 工具授权前端速览](../../reference/agent-tool-approval-contract.md)。

## 验收标准

- [x] widget props 有集中校验。
- [x] 未知 widget 不会导致会话崩溃。
- [x] widget 组件不直接拼接 API URL。
- [x] 注释不引用后端内部实现或私有 ADR。
- [x] 组件库与业务注册表分属不同 workspace。
- [x] 一次中断挂多个动作时不漏卡、裁决数对齐。
