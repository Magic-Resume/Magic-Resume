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

## 自演示状态

余下 16 个目前仍是**自演示 demo**：内置假数据、自己跑定时器。它们能独立渲染（这正是
陈列页能立刻看到效果的原因），但接真实数据前必须把假数据剥成 props。
