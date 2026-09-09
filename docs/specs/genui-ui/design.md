---
title: GenUI 交互层收敛
type: spec
status: Living
owner: kaihuang
created: 2026-08-12
updated: 2026-09-05
summary: 统一 Agent UI 的组件边界、状态来源、导出方式与后端 widget 注册流程。
scope: [apps/web, packages/genui, packages/design-system]
repos: [Magic-Resume, Magic-Resume-Core]
related: [specs/genui-systematization, specs/ai-lab-living-canvas, specs/ai-working-motion]
---

# GenUI 交互层收敛

## 边界

`packages/genui` 是 Agent UI 的唯一实现包，对外只保留 `@magic-resume/genui` 根入口。它
提供契约、宿主、动效、通用控件和生产组件；不读取业务 API、不拥有业务 registry，也不
携带页面级布局。

共享颜色、字体、间距、圆角、阴影和交互 recipe 由
`@magic-resume/design-system` 提供。Web 的 Radix/React Aria 适配器留在
`apps/web/src/components/ui`；Landing 只消费设计系统基础，不反向依赖 Web 或 GenUI。

```text
apps/web ───────────────┐
packages/genui ─────────┼──> packages/design-system
apps/landing ───────────┘
```

## 目录与导出

```text
packages/genui/src/
  contract/    WidgetInstance、WidgetEnvelope、WidgetRegistry
  host/        WidgetHost、GenUIProvider
  motion/      GenUI 动效和 WidgetShell
  primitives/  无业务的交互原语
  widgets/     通用表单和选择控件
  components/  Agent 生产组件
```

消费方从根入口导入：

```ts
import {
  AgentProgress,
  CodeBlock,
  GenUIProvider,
  WidgetHost,
} from '@magic-resume/genui';
```

## 状态与任务进度

生产组件必须受控、可测试、无自演示计时器。`AgentProgress` 的唯一状态来源是宿主接收的
`plan_update.todos`：

```ts
type PlanTodo = {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  progress?: number;
};
```

Web 的 `TasksCard` 只做协议适配，将 todo 转为 `AgentProgress`；不得再维护另一套任务行
实现。组件负责固定卡片几何、真实进度环、完成划线、折叠/展开和 reduced-motion，宿主负责
完成后的退场。

## Widget 事件

业务 registry 属于 Web，负责 `kind`、normalize、数据源、interaction 和 action 回传。
后端 `agent-service` 的 widget registry 位于
`Magic-Resume-Core/apps/agent-service/src/modules/kernel/execution/genui/widget-registry.ts`：

- `exposure: 'push'`：允许 `push_ui` 推送，registry 同时生成描述和最小 props 校验；
- `exposure: 'domain'`：填写 `ownerTool`，只能由真实业务工具查询/写入后推送；
- 业务工具统一 dispatch `UI_WIDGET_EVENT`，mapper 自动投影为 `ui_widget`；
- 新增 kind 不新增 SSE event type，不修改 relay、协议版本或 `ChatController`。

需要阻塞用户回答时优先扩展 `request_form` / `ask_choice`；只有出现全新语义才扩展事件
契约和对应测试。

## 设计系统 token

GenUI 组件使用 `mr-*` 语义类，例如 `bg-mr-surface`、`text-mr-ink-secondary`、
`border-mr-line`、`bg-mr-accent-tint`。Web CSS 必须显式扫描 `packages/genui/src` 和
`packages/design-system/src`，避免 workspace 包的 Tailwind 类静默缺失。

## 验收

- 根导出包含 contract、host、motion、primitives、widgets、components，且没有旧兼容身份；
- `AgentProgress` 在 pending / in_progress / completed、折叠/展开和 reduced-motion 下只
  由 props 驱动；
- 未知 kind、normalize 失败和 malformed payload 都安全降级；
- Web、GenUI、Landing 各自只有一个产品 UI 实现，设计系统不含页面业务；
- 活动源码、文档、CSS、构建入口不出现已废弃的外部组件库标识。
