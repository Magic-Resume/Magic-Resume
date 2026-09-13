---
title: 引用片段递交动效「递纸条」
type: spec
status: Accepted
owner: kaihuang
created: 2026-09-13
updated: 2026-09-13
summary: 「询问 Polaris」把画布选中片段交给输入框的完整旅程——纸条跨面板飞行、小宠接住、按去向区分的退场，以及画布淡标记。
scope: [apps/web]
repos: [Magic-Resume]
related: [specs/ai-lab-living-canvas/design.md, specs/light-theme/design.md, specs/ai-composer-refit/design-brief.md]
---

# 引用片段递交动效「递纸条」—— 设计简报（Design Brief）

> 产物类型：`/impeccable shape` 设计简报（只做设计规划，不含代码）。上游语境：`.impeccable.md`、`docs/specs/ai-lab-living-canvas/design.md`、`docs/specs/light-theme/design.md`。
> 目标组件（`apps/web/src/app/dashboard/edit/_components/ai/` 下）：`conversation/Composer.tsx`（引用卡）、`conversation/PolarisPerch.tsx`（小宠工位）、`canvas/living/LivingCanvas.tsx` 与 `canvas/living/SelectionActionBar.tsx`（选区与「询问 Polaris」）、`conversation/ChatThread.tsx`（消息内引用块）。
> 发现访谈决策：**① Polaris 接住片段（跨面板飞行）② 退场按去向区分 ③ 画布保留淡标记 ④ 每个会话首次完整、之后精简。**

---

## 1. Feature Summary

「询问 Polaris」把画布上选中的一段文字交给对话。本文设计这段文字的完整旅程——从画布到输入框，再并入消息、被取消或被替换——让用户一眼看清「我把哪句话交给了 Polaris」，并借小蓝宠「接住」这个动作，把 IP 的角色感落在一个高频操作上。

**概念：递纸条。** 从简历纸面撕下一张小纸条，递给坐在输入框上沿的 Polaris。

### 现状诊断

- 引用卡在文档流里：出现时整块高度一帧到位；消失时 `AnimatePresence` 先把它淡成一个空洞，160ms 后空间一次性塌掉。
- 同一叠元素三套运动：`PolarisPerch` 没有布局动画（瞬移），输入区外层 `motion.div layout="position"` 走弹簧，引用卡是 160ms 补间，三者互相错位。
- 点「询问 Polaris」时 `runSelectionAction` 立即清掉选区高亮，画布与输入框之间没有任何空间联系。
- 引用卡正文单行 `truncate`，消息里的引用块却是两行 `line-clamp-2`，两处结构不同，接不上连续过渡。

## 2. Primary User Action

**明白「这段话已经交给 Polaris」，然后立刻接着输入要怎么改。** 动画不得阻塞输入：焦点照旧在引用出现的同一帧进入输入框，动画在旁边演完。

## 3. Design Direction

- **物件与角色分治。** 纸条与引用卡是 UI 物件：`--narrate-ease`，只动 transform / opacity，不弹跳。小宠是角色：允许角色动作（抬头、跳帧），沿用 `PolarisPerch` 已确立的例外，且只限小宠本身。
- **一套物理语法。** 纸条飞行复用小宠「欢迎态 → 工位」那一跳的抛物线：x 匀速；y 先 easeOut 上升、再 easeIn 下落；顶点在 34%。Polaris 的世界里东西只有一种飞法。
- **纸，不是光。** 纸条是纸片，不是发光粒子。深色沿用引用卡表面加极细 sky 缘；浅色按 light-theme 规范用 hairline + `--elev-3` 落地影，不要白底上的 sky 大模糊光晕（规范称之为「脏印」）。
- **俏皮只在动作里。** 卡片与读屏文案保持中性，性格由小宠的姿态表达（「俏皮不进建议本体」）。

## 4. Layout Strategy

- 三个地点：右舞台画布（纸面缩放 0.82）、输入框上沿（小宠工位 + 引用卡）、线程（发送后的用户消息）。
- 引用卡保留在输入壳上方，但**先让出空间、再显内容**；小宠与这块空间同一曲线、同一时长被托高。
- 纸条在跨面板的顶层 fixed 层（portal）里飞：画布舞台与对话列各自 `overflow-hidden`，在任一侧内部飞都会被裁。
- 画布淡标记**锚在纸面文字上**，随纸滚动、随缩放。现有选区高亮是 viewport 定位、画布一滚就清的覆盖层，不能直接复用。
- 层级：飞行中的纸条 > 小宠反应 > 空间展开；落位后引用卡是主角，小宠退回坐姿。

## 5. Key States

### A. 进场 · 完整版（会话内首次引用）

| 时间 | 画布 | 纸条 / 引用卡 | 输入框与小宠 |
|---|---|---|---|
| 0ms | 点「询问 Polaris」，动作条按现有方式退场；选区高亮 80ms 内收成淡标记 | 从选区包围盒生成纸条（折叠态：图标 + 「选中片段 · {模块名}」一行） | 焦点进入输入框；上方开始让出空间（300ms，`--narrate-ease`），小宠同曲线上移 |
| 120–420ms | — | 沿抛物线飞向引用卡位置；弧高起始值 min(72px, 距离 × 0.25)；可选 ≤4° 倾斜回正 | ~300ms 切 `excited`（纸条将至，抬头） |
| 420ms | — | 落位：纸条淡出与卡片内容淡入交叉（≤120ms），第二行文字展开 | — |
| ~820ms | 淡标记常驻 | 静止 | `excited` 满一个 `exhop` 周期（520ms，与 SVG 内动画对齐，不截在帧中间）后回 `sit` |

### B. 进场 · 精简版（同一会话再次引用）

不飞纸条。空间展开 + 内容淡入 240ms（`--widget-enter`）；小宠被托高，天线星闪一下（`excited` 半个周期 260ms 或等效）；画布淡标记照常出现。

**触发规则**：每个会话首次引用走完整版，之后一律精简版；「新对话」重置。

### C. 在场

引用卡静止，画布淡标记常驻，小宠 `sit`。悬停引用卡 → 画布对应淡标记加深一档（双向指认）。

### D. 退场 · 发送

- 引用卡**并入消息**：从卡片 rect 变形到新用户消息中引用块的 rect（FLIP，280ms，`--narrate-ease`），结束时由消息里的引用块接替显示。
- 输入框上方空间同步收起，小宠平稳落回（不跳，保持 `sit`）。
- 画布淡标记：若该路径随即进入 processing，交接给就地 shimmer；否则 200ms 淡出（见 §9-1）。

### E. 退场 · 取消（× / 空输入框按退格）

- 引用卡沉回：y 0 → 6px 并淡出，160ms，`--exit-ease`。
- 空间在第 60ms 开始收起（200ms）——**淡出与收起重叠**，不留空洞。
- 小宠随空间平稳下落；画布淡标记 160ms 淡出；焦点留在输入框。

### F. 替换（引用卡在场时又引用新片段）

- 引用卡不退场：旧文本与新文本交叉淡入（150ms，2–4px 纵移），高度差由空间过渡吸收；模块名不同时 label 一并交叉。
- 纸条从新选区飞来（精简版不飞）。
- 画布：旧淡标记淡出、新淡标记淡入，同时进行。

### G. 边缘情况

| 情况 | 处理 |
|---|---|
| 小宠不在场（未开始对话、轨迹视图） | 纸条直接落位，无角色反应 |
| 起终点距离 < 48px | 跳过飞行，走精简版 |
| 连续快速多次「询问 Polaris」 | 进行中的纸条 80ms 淡出，新纸条从新起点起飞，不排队 |
| 画布滚动 | 淡标记随纸移动；引用卡与纸条不受影响 |
| 原文在别处被改写、找不到 | 淡标记静默移除；引用卡保留，发送仍按 path 生效 |
| 片段极长 | 引用卡与消息引用块统一两行截断 |
| `prefers-reduced-motion` | 无飞行、无位移；卡片 120ms 纯淡入淡出，空间直接到位；小宠姿态交给 SVG 自带的 reduced-motion；淡标记直接出现 / 消失 |
| 浅色主题 | 纸条为暖纸卡 + hairline + `--elev-3`；淡标记用 `--ink-sky` 低不透明度底色，不做 blur 光晕 |

## 6. Interaction Model

- **进入**：选中文字 → 动作条 → 「询问 Polaris」。焦点立即进入输入框，占位符切为引用态（现有行为），动画不阻塞输入。
- **取消**：× 或空输入框 Backspace（现有行为），两者走同一退场。
- **指认**：悬停引用卡 → 画布淡标记加深。
- **读屏**：引用出现时 `aria-live="polite"` 播报一次；取消时播报「已移除引用」。
- **性能**：纸条飞行必须是纯 transform 的 FLIP，理由同 `PolarisPerch.tsx` / `polarisFlight.ts` 的注释——点击那一帧同时有聚焦与状态更新，framer-motion 布局动画上不了合成器。
- **运动统一**：小宠、空间、引用卡由同一个位移源驱动，不能再是「弹簧 + 瞬移 + 补间」三套（见 §9-3）。

## 7. Content Requirements

| 位置 | 文案 | 说明 |
|---|---|---|
| 纸条折叠态 / 引用卡 label | 「选中片段 · {模块名}」/ "Selected · {section}" | 现硬编码在 `LivingCanvas.tsx`，需迁入 i18n |
| 引用卡正文 | 片段前两行 | 与消息引用块同为两行截断 |
| 读屏 · 引用出现 | 「已引用{模块名}中的一段，接着输入要怎么改」 | 仅播报一次 |
| 读屏 · 取消 | 「已移除引用」 | — |
| 清除按钮 | 沿用 `aiLab.composer.clearQuote` | — |

**动态范围**：片段 1 字到数百字；中文模块名 2–8 字，英文 label 明显更长，纸条宽度须能容纳，超出截断。

## 8. Recommended References

- impeccable `reference/motion-design.md`——时长、曲线、reduced motion。
- impeccable `reference/interaction-design.md`——焦点、非阻塞、键盘。
- impeccable `reference/color-and-contrast.md`——淡标记在白纸与浅色主题上的对比。
- `docs/specs/light-theme/design.md` §5——Polaris 元素浅色「落纸」规则。
- `conversation/PolarisPerch.tsx` 与 `conversation/polarisFlight.ts`——抛物线参数与 FLIP 写法，直接复用。
- `docs/specs/ai-lab-living-canvas/design.md`——选区驱动。

## 9. Open Questions 与实现结论

1. **发送后的淡标记**：不接 processing shimmer。定向改写等待结果期间不会给该路径打 processing（shimmer 只在结果回来后亮 1s），所以发送时淡标记随引用 id 变化直接淡出（160ms）。
2. **点 label 跳回画布**：未做，保持默认。
3. **位移统一**：保留输入区外层弹簧，但加 `layoutDependency`，只在开场（欢迎态 ↔ 对话态）换位时测量；引用卡的空间用 grid 行高过渡，小宠由布局带动——三者同一条曲线，不再错位。
4. **消息进场动画**：用户消息行自带 opacity / y / scale 进场，而线程是独立滚动容器，引用块在里面做 FLIP 会被裁掉。改为 body 级替身飞行、引用块在后半程淡入接替；替身每帧追引用块的实时位置，线程平滑滚动时也对得上。
5. **窄屏**：未单独处理；起终点距离 < 48px 时自动退为精简版。
6. **SSR 与减弱动效**（实现中发现）：空间过渡不能按 `useReducedMotion` 拼内联样式——SSR 读不到偏好，水合又不修正内联样式，减弱动效的用户会一直带着过渡。过渡放在 `ai-motion.css` 的 `.quote-slot`，由媒体查询关闭。
