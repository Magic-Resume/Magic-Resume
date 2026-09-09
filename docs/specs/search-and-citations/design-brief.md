---
title: 搜索过程与引用来源 — 设计简报
type: spec
status: Draft
owner: kaihuang
created: 2026-09-04
updated: 2026-09-04
status_note: 已实现（P0–P2），仅记忆分区待 Core 验证
summary: AI Lab 对话里「搜索过程行 / 行内引用 / 消息底部来源栏 / 右舷来源面板」四个面的重设计，外加正文行内代码与引用块的排版校正。
scope: [apps/web]
repos: [Magic-Resume, Magic-Resume-Core]
related: [../../../.impeccable.md, ../ai-lab-living-canvas/design.md, ../light-theme/design.md]
---

# 搜索过程与引用来源 — 设计简报

> 产物类型：`/impeccable shape` 设计简报（只做设计规划，不写代码）。交付后可交给 `/impeccable craft` / `/impeccable` 或任意实现流程落地。
> 上游语境：`.impeccable.md`（深色工作台身份 + 五条设计原则）、`docs/specs/light-theme/design.md`（浅色令牌）。
> 参考对象：ChatGPT 的搜索活动行、行内引用浮层、来源栏与活动面板（5 张截图）。

---

## 0. 发现访谈的决策记录

| # | 问题 | 决定 |
|---|---|---|
| ① | 范围 | **四个面全做** + 正文排版两处（行内代码、引用块） |
| ② | 行内引用胶囊显示什么 | **站点名**（「牛客网」），取不到回落域名 |
| ③ | 点击胶囊的主行为 | **先出浮层卡片**，卡里再打开原文；组内 `+N` 可 ← → 翻页 |
| ④ | Core 能否一起改 | **可以** |
| ⑤ | 内部来源（知识库 / 面经 / 范式库） | **只在面板里浮出**，正文行内引用仍只给外部网页 |
| ⑥ | 面板粒度 | **单轮**——入口是某条回答底部的「来源」胶囊 |
| ⑦ | 搜索查询词 | **展开后可见**，折叠态不显示 |
| ⑧ | 正文排版 | 行内代码改中性亮字；引用块从「降级」翻转为「强调」 |
| ⑨ | 面板放哪（用户补充） | **右舷第三位住客**，与简历画布 / 报告画布互斥，点画布即顶掉它 |

---

## 1. Feature Summary

Polaris 在回答求职问题时会联网搜索，但**用户看不清它到底碰了外面的什么**。这次把「搜索过程 → 行内引用 → 来源清单」这条证据链在界面上补全：搜索行按次独立、可展开看查询词与站点；行内 `[n]` 变成带站点名的胶囊，点开是一张能翻页的来源卡；回答底部一枚来源胶囊，点开右舷的来源面板，里面除了网页还第一次露出「记忆」（知识库 / 面经 / 简历范式库）。面向的是**准备投递、需要判断 AI 说的话可不可信**的求职者。

## 2. Primary User Action

用户读到一句关于目标公司 / 岗位的具体断言时，能**在不离开对话的前提下**用两秒钟判断这句话有没有出处、出处是谁、新不新——判断完继续读，而不是被迫开一堆新标签页。

## 3. Design Direction

延用 `.impeccable.md` 的深色工作台身份，本特性在其中扮演的角色是**旁白里的脚注**，不是新的主角。三条自我约束：

- **证据是旁白，不是章节。** 搜索行、引用胶囊在正文的字号 / 色阶之下（`--ink-3` / `--ink-2` 一档），它们是正文的注脚而不是并列内容。任何时候读者的眼睛应该先走完正文，再决定要不要看证据。
- **信息随掌握程度递进，而不是一次摊开。** 折叠行只说「搜了几个站」，展开才给查询词和站点，胶囊只给站点名，浮层才给标题 / 日期。**每一层都必须是真信息**——一个从头到尾不变的「搜索中」证明不了任何事（这正是现状的问题，见 §4.0）。
- **能点的都点得开。** 行内引用只给有 http(s) URL 的外部来源；内部来源没有可公开链接，所以它只出现在面板里、并明确标注「不对外链接」。**一个点不开的引用胶囊是个兽不兽的承诺**——这条已经是 `citationSources.ts` 里写下的规矩，这次继续守。

对应原则：②能力按需浮现（折叠优先）、③AI 是合作者（把证据交出来供质疑）、④就地而非另开（浮层与右舷共用槽位，不弹模态）。

## 4. 现状与差距

### 4.0 三个不是「不好看」而是「不对」的问题

盘点时发现的三条，优先级高于任何视觉调整：

1. **一轮多次搜索显示同一个数字。** `ToolLine.describeSearch()` 读的是 `message.sources`——**整条消息**合并后的来源，不是这次调用的。所以参考图里「搜索 9 个网站 / 搜索 3 个网站」那种真实分次感，我们现在渲染成两行一模一样的「正在搜索 12 个网站」。
2. **搜完了还在说「正在搜索」。** `describeSearch()` 没有 `call.done` 分支，两个文案都是现在进行时且永不变化。一条读完的历史消息里，那行字仍写着「正在搜索」。
3. **搜索失败 / 空结果 / 额度耗尽在界面上完全不存在。** Core 的 `WEB_SEARCH_RESULT_STATUS` 有 11 个状态（`empty`、`unavailable`、`daily_limit_exhausted`、`insufficient_credits`…），工具把它们作为**正常结果**返回（不是 `isError`），而前端 `citationSourcesFromWebSearchToolResult()` 只读 `results`。于是「今天搜索额度用完了」在用户眼里是：一行「正在搜索网页」，然后什么都没有。**这是最伤信任的一种失败——静默的。**

### 4.1 四个面的逐项差距

| 面 | 文件 | 现状 | 差距 |
|---|---|---|---|
| 搜索过程行 | `conversation/ToolLine.tsx` | 单行文案 + 最多 4 个 favicon，不可展开 | 上述三条；无查询词；站点只有图标没有名字 |
| 行内引用 | `conversation/Markdown.tsx` `LinkRenderer` | `[favicon] nowcoder.com` 胶囊，点击直接开新标签 | 显示裸域名；悬停只有原生 `title`（约 1s 延迟、样式不可控、触屏无效）；`+N` 组只显示「2 个来源」，无法在组内翻页看到是哪两条 |
| 消息底部 | `conversation/ChatThread.tsx` `SourcesBlock` | 动作行（带文字的复制 / 重新生成）+ 来源按钮 + 就地展开列表 | 结构已接近参考图 4；动作应转纯图标；来源改为开右舷面板 |
| 来源面板 | 无（`ConversationTrajectory` 不是它） | 现有轨迹页是 Steps / Calls 泳道的**开发者**视图，且整列替换对话 | 需要一个用户向的「本轮来源」面板 |

### 4.2 数据侧的两个前提（已核对）

- **`sourceName` 全链路是空的。** 前端 `CitationSource.sourceName`（`types.ts:190`）和 Core 契约 `AgentCitationSource.sourceName`（`agent-events.contracts.ts:69`）都已声明，但 `readWebSearchSources()` 不填它——而更上游的 `WebSearchResult`（`packages/shared/src/search/search-provider.ts:15`）**根本没有这个字段**，没有任何 provider 返回站点名。所以 §5.2 的站点名必须靠推导，见 §8.2。
- **`source_update` 不带 `toolCallId`。** 事件由 `web-search.tool.ts:436` 的 `dispatchCustomEvent(WEB_SEARCH_SOURCES_EVENT, { results })` 发出，payload 里只有 results；mapper（`event.mapper.ts:294`）也就无从归属。按次搜索的来源归属必须由 Core 补上，见 §8.1。

---

## 5. Layout Strategy

### 5.0 右舷槽位（先说结构，因为它约束其余）

`lib/stageIntent.ts` 已经为这件事铺好了路，原文：

> 「新增第三种右舷内容时，必须再发明一个宽度数字」……第 3 条是根因。所以这里插一个意图层：**内容决定意图，意图决定宽度，宽度不再认识内容。**

来源面板就是那第三位住客，意图 `assist`（在旁边给东西看）——**沿用 44%，不发明新宽度数字**。它与 `LivingCanvas`（`immerse` 58%）、`ArtifactCanvas`（`assist` 44%）在同一个 `AnimatePresence mode="wait"` 槽位里互斥交叉淡入：点开简历画布或分析报告，来源面板自然被顶掉，反之亦然。

状态形状建议：右舷当前住客升级为一个**判别联合**（living / artifact / sources），而不是再加第三个布尔开关——三个布尔能组合出 8 种状态而只有 4 种合法，那是下一个 bug 的温床。`stageIntentOf()` 的入参跟着换成这个联合值。

### 5.1 搜索过程行（图 1）

正文流里的一行，缩在正文左边界上，**不进卡片**（原则：不是所有东西都需要容器）。

```text
折叠（默认）
  🌐  正在搜索 9 个网站                    ⌄        ← h-7，ink-3，12.5px
       ↑ 站点图标叠放 3 枚（有来源后）或通用地球（还没有）

展开
  🌐  搜了 9 个网站                        ⌃
      「字节跳动 2027 前端 校招 JD」                 ← 查询词，ink-2，13px，引号内
      [🔵 牛客网] [🟡 JDWatch] [🔴 字节跳动种子]      ← 站点胶囊，可换行
      [🟢 杭电就业] [⚪ 拉勾网] …
```

- 折叠行左侧图标：**有来源时叠放前 3 枚 favicon**（`-space-x-1`，18px，圆形，`border-raised` 描边），无来源时一枚地球。参考图第一行用的是单站图标、第二行用地球——叠放比这两者都更能一眼传达「碰了多个外部站点」。
- 展开区用现成的 `AgentDisclosure`（`clipPath: inset` + `y`，220ms 进 / 140ms 出，`ease [0.16,1,0.3,1]`），与 `ReasoningActivity` 同一套观感，不新造展开动画。
- 站点胶囊：`rounded-full`、h-7、`bg-inset`、hover `bg-hover`；内容为 18px favicon + 站点名。**胶囊即链接**，点击直接开原文（这里不需要浮层——它已经在展开区里，上下文完整）。
- 一轮里多次搜索 = 多行，各自独立计数、独立展开态。

### 5.2 行内引用胶囊 + 浮层卡（图 2）

```text
正文：…今年字节前端 JD 已经不只是 React/Vue [🔵 牛客网 +1] 了，AI Coding…
                                            ↑ h-6 胶囊，align-[-1px]，
                                              14px favicon + 站点名（max-w-10rem truncate）
点击 ↓
      ┌───────────────────────────────────┐  w-[300px] rounded-xl
      │  ←    →                      1/2  │  头部：翻页 + 计数（tabular-nums）
      │                                   │
      │  🔵 牛客网                         │  站点行 11px ink-3
      │  AI前端开发工程师-抖音搜索（招正式    │  标题 13.5px ink，2 行 clamp
      │  和实习）_字节跳动实习               │
      │                                   │
      │  2026年8月25日          ↗ 打开     │  日期 11px ink-3 · 打开 = 真链接
      └───────────────────────────────────┘
```

- **胶囊上写这条来源自己的 `title`**（「字节跳动招聘官网」），不另造一层「站点名」。
  取值顺序：`title` → provider 的 `sourceName`（今天没有任何一家返回）→ 域名。
  **这里曾经是一张手写的域名→站点名映射表，已删除**（见 §11-9）：provider 本来就返回了标题，
  那是真数据；一张表只覆盖写表时想到的那些站，会造出一半说「牛客网」、一半说
  `jobs.bytedance.com` 的两类观感，区别只在于当时有没有想到那个域名。
- **域名降为归属行**：浮层卡与面板行的小灰行放域名、粗体行放标题，两者分工，不再重复。
- 组内 `+N`：胶囊只显示**第一条**的站点名 + `+N`（参考图做法），比现状的「2 个来源」更具体。翻页只在组内，不跨组。
- 浮层复用 `canvas/living/ActionPopover.tsx` 已经验证过的锚定模式：`useLayoutEffect` 量高度后夹进视口、外部点击与 Escape 关闭。**不要新写一套定位逻辑。**
- `snippet` 已在数据里但**不放进卡片**：三行摘要会把这张卡撑成一个小阅读器，而它的职责是「让人两秒钟决定要不要点」。摘要留给面板（§5.4）。

### 5.3 消息底部工具栏（图 4）

```text
现在：  [⧉ 复制]  [↻ 重新生成]    [🔵🟡🔴 9 个来源 ⌄]
改后：  [⧉] [↻]  ·  [🔵🟡🔴 9 个来源]
        ↑ 纯图标，aria-label 保留    ↑ 开右舷面板，不再就地展开
```

- 动作按钮转纯图标（复制成功时短暂换成 ✓ + 「已复制」，这一处保留文字——**反馈需要词**）。
- 来源胶囊**保留计数**，这是与参考图的一处刻意分歧：参考图只写「来源」是因为它的面板会给数字，而计数本身就说明了这轮调研的深度，是折叠态最值钱的一个字。
- **就地展开列表整个删掉。** 同一份清单有两个入口比没有更糟；面板是它的新家。

### 5.4 右舷来源面板（图 5）

```text
┌──────────────────────────────────┐
│  来源                    12s   ✕ │  头部：本轮耗时（来自 trajectory）
├──────────────────────────────────┤
│  网页 · 9                        │  分区标题，ink-3 11px
│                                  │
│  🔵 牛客网                   [1] │  站点名 + citationId
│  AI前端开发工程师-抖音搜索…        │  标题 13.5px ink，2 行 clamp
│  2026年8月25日                   │  日期 11px ink-3
│  ─────────────────────────────   │  1px hairline 分隔（浅色下必需）
│  🟡 JDWatch                  [2] │
│  …                               │
│                                  │
│  记忆 · 3                        │  ← 第一次露出内部来源
│  面经库 · 字节跳动前端一面          │
│  简历范式库 · 互联网前端           │
│  这些来自 Magic 自己的库，不对外链接 │  说明句，ink-3
└──────────────────────────────────┘
```

- 面板范围 = **这一条回答**。头部耗时取该消息的 `trajectory`（已有数据）。
- 「网页」条目就是现有 `SourcesBlock` 展开列表的放大版：多了呼吸、`snippet` 有空间放 2 行、编号 `[n]` 与正文里的 `[n]` 对应。
- 「记忆」条目**没有链接**，视觉上必须与网页条目可区分（无 favicon、用一枚统一的库图标；hover 不给「可点击」的手势）。说明句只出现一次，放在分区末尾。
- 运行中打开面板：条目实时追加，新条目淡入（opacity + y 4px，stagger 24ms）。**已有条目不得重播动画**——同 `Markdown.tsx` 里 `Words` 的 key 纪律。

---

## 6. Key States

### 6.1 搜索过程行

| 状态 | 触发 | 界面 |
|---|---|---|
| 运行中 · 尚无来源 | `!call.done`，本次来源为空 | 地球图标 + 「正在搜索网页」，文案走 `ai-narrate` 呼吸 |
| 运行中 · 已有来源 | `!call.done`，本次来源 N 条 | 叠放 favicon + 「正在搜索 {{N}} 个网站」，仍呼吸 |
| 完成 | `call.done`，N ≥ 1 | 「**搜了** {{N}} 个网站」，停止呼吸，chevron 可用 |
| 空结果 | 结果 `status === "empty"` | 「没搜到相关网页」；展开仍给查询词——**用户至少要能看出它搜错了词** |
| 不可用 | `unavailable` / `provider_unavailable` | 「搜索暂时不可用」，无 chevron |
| 额度耗尽 | `daily_limit_exhausted` / `quota_unavailable` / `insufficient_credits` | 「今天的搜索额度用完了」，**这一条要能引到升级入口**（复用 `ProUpgradeBanner` 的入口，不新造） |
| 失败 | `call.error` | 「这次搜索没成功」，展开给查询词 |
| 深度搜索 | `mode === "deep"` | 文案换成「深度调研了 {{N}} 个网站」；`deep_search_partial` 追加「（部分结果）」 |

> 后四种状态需要工具结果里的 `status` 能传到前端。它已经在 `toolResult()` 的 JSON 里，只是没有人读——`citationSourcesFromWebSearchToolResult()` 旁边加一个 `readWebSearchStatus()` 即可，不需要新事件。

### 6.2 行内引用胶囊

| 状态 | 界面 |
|---|---|
| 单来源 | `[favicon] 站点名` |
| 组内多来源 | `[favicon] 首条站点名 +N`；浮层头部出现 ← → 与 `n/N` |
| 来源未到（流式中） | 保持现有「来源暂不可用」缺失态，来源事件到达后原地替换。**不要闪一个 `[4]` 裸数字** |
| 来源永久缺失（历史消息没存来源） | 同上，且不可点击、无 hover 反馈 |
| 无日期 | 卡片底行只留「↗ 打开」，不留空行 |
| 站点名推不出 | 显示注册域名，卡片站点行同样显示域名 |
| 非交互上下文（widget 内） | 沿用现有 `interactiveLinks=false`：渲染成不可点的 span，不挂浮层 |

### 6.3 来源面板

| 状态 | 界面 |
|---|---|
| 网页 + 记忆都有 | 两个分区，网页在上 |
| 只有网页 | 不渲染记忆分区（**不留一个空标题**） |
| 只有记忆 | 只渲染记忆分区；此时底部来源胶囊的叠放图标用统一库图标 |
| 两者都没有 | **底部来源胶囊根本不出现**，面板无从打开 |
| 运行中 | 条目实时追加；头部耗时走秒表 |
| 被顶掉 | 用户点简历画布 / 报告 → 交叉淡入换出，来源胶囊回到未选中态 |
| 窄视口 | 右舷 44% 不成立时，面板改为**接管对话列**（复用 `conversationView === "trajectory"` 已有的整列替换模式），而不是缩成一条 |

### 6.4 正文排版（图 3）

| 元素 | 现状 | 改后 |
|---|---|---|
| 行内代码 | `text-accent-ink`（sky 蓝）+ `text-[12.5px]` + `px-1.5 py-0.5` | 中性 `text-ink` + `text-[13px]` + `px-[0.4em] py-[0.15em]`，底仍 `bg-inset`。**sky 蓝还给真正的链接与强调**，不再被代码占用 |
| 引用块 | `border-l-2 border-accent/35` + `text-ink-2`（比正文暗） | `border-l` **1px** `border-line` + `text-ink` + `font-medium`，行高略放。模型用引用块基本都是「划重点」，把它调暗是反的 |

> 引用块的左规保持 1px：更粗的彩色左条是最容易辨认的模板化痕迹，而 1px 中性发丝线同时满足参考图的观感与浅色主题「靠清晰 hairline 造层次」的既定策略。

---

## 7. Interaction Model

**搜索行**
- 整行是 `<button aria-expanded aria-controls>`；展开区 `role="region"`。
- 折叠态**不自动展开**——即使运行中。过程是旁白，不是要读者停下来看的东西。
- 站点胶囊 `<a target="_blank" rel="noopener noreferrer">`，hover 抬 1px（`translate-y-[-1px]`），active `scale(0.98)`。

**行内引用**
- 胶囊 `<button aria-haspopup="dialog" aria-expanded>`；点击开浮层，**不直接跳转**（决策③）。
- 浮层 `role="dialog" aria-modal="false"`：Escape 关、外部点击关、关闭后焦点回胶囊。**不做全屏遮罩**——它是脚注不是模态。
- 组内翻页：← → 按钮 + 键盘方向键；内容水平位移 8px + 淡入，方向跟随；到头即禁用，**不循环**（循环会让「1/2」这个计数失去意义）。
- 「↗ 打开」是卡里唯一的导航出口，真链接、新标签。
- 同一时刻只允许一个浮层存在；打开新的即关掉旧的。

**底部来源胶囊 → 面板**
- 点击 = 打开右舷来源面板并高亮胶囊；再点 = 关闭（与 `toggleCanvas` 的开关语义一致）。
- 打开简历画布 / 报告 → 面板被顶掉，胶囊回到未选中态（**不需要用户先手动关**）。
- 面板内条目点击 = 新标签打开；记忆条目不可点击。

**正文 ↔ 面板的呼应（值得做但可后置）**
- 面板打开时，hover 面板里的某条 → 正文中对应 `[n]` 胶囊短暂高亮（`--accent-tint` 底 160ms）。这是「就地」原则在这个特性上最漂亮的一笔，但它依赖正文与面板的跨组件寻址；**列为 P2**，不阻塞主线。

**动效纪律**（沿用 `.impeccable.md`：轻、快、贴着元素，仅 transform / opacity，不弹跳）
- 展开：`AgentDisclosure` 220 / 140ms，`cubic-bezier(0.16,1,0.3,1)`。
- 浮层：opacity + `y:-4` + `scale:0.98`，150ms ease-out（与 `HeaderQuota` 的浮层同款）。
- 面板换出入：沿用右舷现有的 160ms 交叉淡入，**不新增动效**。
- 全部走 `useReducedMotion()`——三个原语已内建。

**可及性**
- 新增的静音文字（站点名 `--ink-2`、日期 `--ink-3`）必须在**深浅两套主题**下都过 AA。浅色下 sky 走 `--ink-sky`（sky-700），不要用装饰用的 `--glow-sky`。
- 面板列表用 `<ol>` 保序，序号即 `citationId`。
- 所有 favicon `aria-hidden`，信息由紧邻的站点名承担（现有 `SiteFavicon` 已如此）。

---

## 8. 依赖：Core（agent-service）契约变更

### 8.1 `source_update` 携带 `toolCallId`（必须，否则 §4.0-1 无解）

- `web-search.tool.ts`：`_call` 签名接上 `runManager`，`emitSources()` 把 `runManager?.runId` 一并 dispatch。**`event.mapper.ts` 的 `toolCallId` 用的就是 LangChain 的 `runId`**（`toolCallId: runId`，见 `event.mapper.ts:351`），两边天然对得上——但这条相等关系要在实现时用一条集成断言钉住，不能只靠推理。
- `event.mapper.ts`：`source_update` payload 透传 `toolCallId`。
- `agent-events.contracts.ts`：`source_update` 增加可选 `toolCallId`。
- 前端：`message.sources` 保持全量合并（正文 `[n]` 需要全量），**另存一份 `toolCallId → citationId[]` 的索引**给搜索行用。旧部署没有 `toolCallId` 时，搜索行回落到现有的全量行为——降级要不声不响，不能报错。

### 8.2 `sourceName`：**不改 Core**（相对访谈时的判断做了修正）

访谈时我说「Core 补 sourceName 映射」，核对后改主意：`WebSearchResult` 里根本没有站点名，**没有任何 provider 返回它**，Core 补不出一个它不知道的事实。站点名是推导出来的展示文案，就该待在 i18n 和文案表旁边（§5.2）。Core 那个已声明的 `sourceName` 字段保留为未来 provider 真给了的权威覆盖位。

### 8.3 内部来源的可见性（需确认后端已在发）

`normalizeCitationSources()` 已能解析 `kind: "internal"`，`mergeCitationSources()` 也留着它们，只有 `visibleCitationSources()` 过滤掉。**但要先确认 Core 现在到底发不发内部来源的 `source_update`**——`task-workflow.service.ts:412` 那条路径在造带 `sourceName` 的内部来源，但它是否进入 `/api/chat` 的 SSE 流没有核实。若没有，§5.4 的记忆分区需要 Core 补一条发送路径，这是本简报**唯一没验证到底的依赖**。

---

## 9. Content Requirements

新增 i18n（`aiLab.*`，zh + en 都要，`i18n:check` 会守着）：

```
aiLab.tools.searchedSites       搜了 {{count}} 个网站            Searched {{count}} sites
aiLab.search.empty              没搜到相关网页                   No results found
aiLab.search.unavailable        搜索暂时不可用                   Search is unavailable
aiLab.search.quota              今天的搜索额度用完了              Daily search limit reached
aiLab.search.failed             这次搜索没成功                   That search didn't go through
aiLab.search.deepDone           深度调研了 {{count}} 个网站       Researched {{count}} sites
aiLab.search.partial            （部分结果）                     (partial results)
aiLab.search.toggle             展开或收起这次搜索的来源           Show or hide this search's sources
aiLab.sources.open              打开原文                        Open
aiLab.sources.prev / next       上一个来源 / 下一个来源           Previous / Next source
aiLab.sources.position          {{index}}/{{total}}
aiLab.sources.panel.title       来源                            Sources
aiLab.sources.panel.web         网页 · {{count}}                Web · {{count}}
aiLab.sources.panel.memory      记忆 · {{count}}                Memory · {{count}}
aiLab.sources.panel.memoryHint  来自 Magic 自己的库，不对外链接    From Magic's own library — no public link
aiLab.sources.panel.close       关闭来源                        Close sources
```

复用现有：`aiLab.tools.searchingWeb`、`aiLab.tools.searchingSites`、`aiLab.sources.count`、`aiLab.sources.unavailable`、`aiLab.chat.copy` / `copied` / `regenerate`。

文案纪律（`.impeccable.md`）：UI 微文案简短、动词开头、不复述用户已见；俏皮不进这里——搜索失败的那几句尤其要**直白**，那是用户最需要确定信息的时刻。

**现实取值范围**（设计时按这个量，不要按 3 条的理想值画）
- 一轮搜索次数：0 / 1–2 / 最多 5（`MAX_CITATIONS = 15`，deep 模式 `DEEP_QUERY_MAX_RESULTS = 5`）
- 单次结果数：1 / 5 / 10（`RESULT_MAX_LIMIT = 10`）
- 一条消息总来源：0 / 6 / 15
- 标题长度：中文站点标题常见 30–60 字，**必须按 2 行 clamp 设计，不能假设一行**
- 查询词长度：2–500 字符（`QUERY_MAX_LENGTH`），中文查询 15–30 字常见
- 站点名：2–8 字；域名回落最长按 `xxxxxxxx.com.cn` 量

---

## 10. Recommended References

实现时按需取 `impeccable/reference/` 下：

- **`interaction-design.md`** — 浮层焦点管理、disclosure、渐进披露。本特性交互密度最高的一块。
- **`motion-design.md`** — 时长 / 缓动 / reduced motion。注意本仓已有三个动效原语（`AgentDisclosure` / `ActionPopover` / 右舷 `AnimatePresence`），**优先复用而不是照 reference 新写**。
- **`color-and-contrast.md`** — 新增静音文字在深浅两套主题下的 AA 核验。
- **`typography.md`** — §6.4 行内代码与引用块的字号 / 字重决策。

---

## 11. Open Questions

实现后的状态（2026-09-04）：

1. ~~**`runManager.runId === on_tool_start 的 run_id`** 需要一条集成断言钉住~~ — **已解决**。
   `web-search-run-id.seam.spec.ts` 实测通过。实现时发现一件读代码看不出来的事：裸调工具
   （`tool.streamEvents(...)`）**不会进 `runWithConfig`**，ALS 里没有 config，
   `dispatchCustomEvent` 会被静默丢弃。生产里工具跑在 LangGraph 节点内所以没事，但这意味着
   任何验证这条链路的测试都必须经 `RunnableLambda` 调用，否则会得到一个「事件根本没发」的
   假阴性。
2. **内部来源到底发不发**（§8.3）—— **仍未验证，且是唯一阻塞项**。面板的记忆分区已按契约
   写好（`internalCitationSources()`），Core 不发就永远是空的（分区不渲染，不留空标题）。
   验证方法不变：跑一次会命中知识库的对话，看 SSE 里有没有 `kind:"internal"` 的
   `source_update`。
3. **窄视口的断点值**（§6.3 末行）—— 已实现为 `STAGE_TAKEOVER_BREAKPOINT = 1024`，**只作用于
   来源面板**（活画布 / 报告画布的窄屏行为不在这次范围里顺手改）。1024 仍是估计值，要拿窄
   窗口实测。
4. **站点名表的初始条目** —— 已按建议的方向先落 32 条（求职 / 技术社区 / 资讯三类），
   见 `conversation/sourceNames.ts`。仍建议上线后用真实域名分布回补，凭印象列的表会漏掉真正
   高频的招聘聚合站。
5. **正文 ↔ 面板的 hover 呼应**（§7 P2）—— 未做，仍是 P2。
6. **深度搜索（`mode: "deep"`）的过程行** —— 只做到「按 `deep_search_*` 状态换文案 + 部分结果
   后缀」；是否值得一个「N 个子查询」的层级仍无真实样本可判断。

9. **手写的域名→站点名映射表已删除。** 实现时我先写了一张 32 条的
   `conversation/sourceNames.ts`（nowcoder→牛客网、zhipin→BOSS 直聘…），并在同一个文件里写下
   「表里没有的老实显示域名，不猜」——**预先猜也是猜**，那条规则和它上面的表是自相矛盾的。
   而且 provider 返回的 `title` 本来就是可读的真数据（「字节跳动招聘官网」），比任何映射表都
   准确、且永远不会过期。现在胶囊写 `title`、归属行写域名，`sourceHeadline()` 收在
   `citationSources.ts` 里。

8. **provider 实测（2026-09-04，Serper key 已配置）** —— 拿真实 key 各跑一次中英查询，结论
   修正了简报里两处判断：

   | 查询 | organic | 有 `date` | 有 `faviconUrl` |
   |---|---|---|---|
   | 字节跳动 2027 前端 校招 JD | 8 | 0/8 | **0/8** |
   | AI前端开发工程师 字节跳动 岗位要求 | 8 | 0/8 | **0/8** |
   | ByteDance frontend engineer campus hiring 2027 | 8 | 2/8 | **0/8** |

   - **中文查询不返回 0 条**，且头几条是 `jobs.bytedance.com` 官方页与 `zhipin.com`——原先担心
     的「Serper 空手而归把中文三家埋掉」在实测里没有出现。链首空结果 failover 仍然做了，但它
     是安全网而不是补救。
   - **Serper 一个 favicon 字段都不返回。** 但简报此前把这件事说重了：`siteFaviconUrl()` 早有
     `/favicon.ico` 同源推导回退，界面不会退化成一排灰地球，只是图标改由浏览器直接向目标站取。
   - **中文查询拿不到日期（0/8）。** §6.2 把「无日期」列为边缘状态是错的，**它是中文场景的常态**
     ——浮层卡与面板行必须按「通常没有日期」来看版式，好在实现已经是「没有就不留空行」。
     补测：加上 `gl=cn`/`hl=zh-cn` 后也只有 1/8，locale 救不了日期，这条结论不变。
   - **不传 `gl`/`hl` 时 serper 缺省是美区英文 Google。** 同一条「2027 校招」查询，缺省区把过期
     一年的 2026 帖排在前面，中国区才给出 2027 届那条；标题也回到站点自己的格式
     （`「…」-BOSS直聘`），正好喂给 §5.2 那张站点名表。已在 Core 侧按中文查询发 CN locale。

实现期新发现的一条（不在原简报里）：

7. **运行中的搜索行会借用上一次搜索的来源。** 「没有 `citationIds` 就退回整轮合并」这条降级
   规则，在 `source_update` 还没到的那个窗口里，会让本轮第二次搜索当场显示第一次的数字和图标
   ——正是 §4.0-1 要修的 bug 换了个地方复发。现在按三种情况分开处理（还在跑 / 跑完带 status /
   两样都没有的老消息），见 `sourcesForToolCall()`。

---

## 12. 实施顺序建议

按「先补不对的，再做好看的」：

1. **P0 · 三个正确性问题**（§4.0）：按次归属（含 Core 的 `toolCallId`）、完成态文案、失败 / 空 / 额度状态。这三条不做，后面的视觉全是给错误信息穿衣服。
2. **P1 · 搜索行展开**（§5.1）+ **行内胶囊与浮层**（§5.2）。这两块是参考图里信息增量最大的部分。
3. **P1 · 底部工具栏 + 右舷面板**（§5.3 / §5.4）。面板依赖右舷状态形状的小重构（§5.0）。
4. **P2 · 正文排版两处**（§6.4）。独立、可随时插入、可单独回滚。
5. **P2 · 正文 ↔ 面板呼应**（§7）。
