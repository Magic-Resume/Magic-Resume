# @magic-resume/genui

Magic Resume Agent / GenUI 的渲染包：契约、宿主、动效、通用控件和生产卡片。

## 边界

包只负责“怎么显示和交互”，消费方负责“显示什么”：

- `packages/genui` 不读取产品 API，不拥有 widget registry，也不拥有业务字段定义。
- `apps/web` 的 AI seam 负责 `WidgetHost` registry、props normalize、数据源和 action 回传。
- Agent 的 `plan_update.todos` 由 Web 的 `TasksCard` 转成 `AgentProgress`；任务步骤不再有第二套行组件。
- 组件从包根导入，内部目录是实现细节：

```ts
import {
  AgentProgress,
  CodeBlock,
  GenUIProvider,
  WidgetHost,
} from '@magic-resume/genui';
```

## 主题与 Tailwind

组件使用共享设计系统的 `mr-*` 语义 token（例如 `bg-mr-surface`、
`text-mr-ink-secondary`、`border-mr-line`）。消费方需要导入设计系统样式，并显式扫描
workspace 源码：

```css
@import '@magic-resume-kit/design-system/styles/tokens.css';
@source '<relative-path>/packages/genui/src';
```

Web 的 `apps/web/src/app/globals.css` 已包含这两项；Landing 不消费 GenUI。

## Agent 状态

生产组件是受控的。`AgentProgress` 不会自行推进、不创建假 loading，也不请求业务 API：

```tsx
<AgentProgress
  steps={todos.map((todo, index) => ({
    key: `${todo.content}-${index}`,
    label: todo.content,
    status: todo.status,
    progress: todo.status === 'in_progress' ? todo.progress : undefined,
  }))}
/>
```

支持 `pending`、`in_progress`、`completed`、折叠/展开、完成态和 reduced-motion。

## 新增后端 widget kind

协议仍然只发送一个 `ui_widget` 事件。本仓库的 agent（`apps/agent`）在
`apps/agent/src/harness/tools/widgets.ts` 登记 kind：

1. `WIDGET_SCHEMAS` 为每个 kind 定义 props 的 zod schema，与前端注册表的 kind 一一对应。
2. 列入 `PUSHABLE_WIDGETS` 的普通卡片可由 `push_ui` 发送，发送前按 schema 校验；其余业务卡片只能由对应的业务工具发送，`push_ui` 会拒绝。
3. 业务工具 dispatch `ui_widget` 自定义事件，事件映射会原样转成 SSE 的 `ui_widget`，无需新增事件类型。
4. 新增阻塞交互优先扩展 `request_form` / `ask_choice`，只有新语义才新增事件类型。

## i18n 与动效

组件不携带 i18n 实例；宿主提供 `I18nextProvider` 和文案。所有动画尊重
`prefers-reduced-motion`，状态变化由宿主事件流驱动。

## Storybook

GenUI 的组件工作台位于本包内，故事使用受控 props 和协议形状的 fixture，便于逐个验收
状态、交互和无障碍行为；不会启动假定时器或模拟 Agent 进度。

在仓库根目录运行：

```bash
pnpm --filter @magic-resume/genui storybook
```

然后打开 <http://localhost:6006>。构建静态预览可运行：

```bash
pnpm --filter @magic-resume/genui build-storybook
```

Storybook 配置和故事也可以单独做类型校验：

```bash
pnpm --filter @magic-resume/genui storybook:typecheck
```

故事源码位于 `packages/genui/stories`，配置和共享预览样式位于
`packages/genui/.storybook`。新增组件时优先补充受控状态故事，再接入真实宿主事件流。
