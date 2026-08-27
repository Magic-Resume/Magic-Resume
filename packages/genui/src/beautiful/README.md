# Beautiful UI 组件

来源见 `docs/specs/genui-beautiful-ui/design.md`。

## 目录约定

- `*.tsx` —— 工作副本，会被逐步产品化（剥假数据 → 定 props → 接真实事件流），**进构建**
- `_vendor/*.tsx` —— 未改动原件，**不进构建**（`tsconfig.json` 的 exclude）

保留原件是为了升级时能对比：改过的和原版混在一起，下次就分不清哪些是我们的改动。

## 三个暂不进构建的组件

它们有外部依赖，而我们现在不接线，为不接线的组件引新依赖不划算。原件都在 `_vendor/`，
要用的时候把依赖装上再挪回来：

| 组件 | 依赖 | 说明 |
|---|---|---|
| `InsightCards` | `liveline@0.0.7` | 实时动画图表。0.0.x 版本，且我们暂无数据面板 |
| `PromptBar` | `glimm@0.3.0` | WebGL 扫光过渡。我们的 Composer 已有 canvas 点阵，是否值得再上 WebGL 要单独判断 |
| `SelectionActions` | `iconoir-react` + `@/components/atoms/{Shimmer,StreamText}` | 后两个是**他们未公开的内部组件**，不重写就跑不起来 |

## 产品化状态

**不要按「余下的都是 demo」来假设** —— 这份清单以前就是那么写的，然后一路过时。
事实来源是陈列页 `apps/web/src/app/genui/page.tsx`，每个组件在那里标了档位；这里
只是它的摘要，改动时两边一起改。

| 档位 | 含义 | 组件 |
|---|---|---|
| `wired` | 已接进产品、跑真实数据 | `CodeBlock`（markdown 围栏）、`ApprovalCard`（HITL 中断）、`RecommendationCard`（ask_choice）、`ToolChips`、`Icon`、`TaskRows`（任务卡）、`RecordsTable`（投递面板）、`SidebarNav`（历史抽屉） |
| `props` | 已剥成 props，但暂无调用点 | `ThinkingState`、`LoadingState`、`ContextCards`、`SearchList`、`FilterTable`（原本接在投递面板上，2026-08-24 被 `RecordsTable` 顶替） |
| `demo` | 仍是自演示：内置假数据、自跑定时器 | `ChatComposer`、`DiffTable`、`StreamingText`、`FineTuneCard` |

`demo` 档的接真实数据前必须先把假数据剥成 props——**剥的时候一并把英文写死文案
提成调用方传入**：`i18n-check` 只认中文，英文硬编码它一个都拦不住。
