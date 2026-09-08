---
title: CodeBlock 重构 — 设计简报
type: spec
status: Draft
owner: kaihuang
created: 2026-09-04
updated: 2026-09-04
summary: 把 genui 的 CodeBlock 从「一个勉强兼顾两边的代码框」重构成「一个组件、两档形态」——对话里的代码片段与产物预览里的调研文档。
scope: [packages/genui, apps/web]
repos: [Magic-Resume]
related: [../search-and-citations/design-brief.md, ../../../.impeccable.md]
---

# CodeBlock 重构 — 设计简报

> 产物类型：`/impeccable shape` 设计简报（只做设计规划，不写代码）。
> 上游语境：`.impeccable.md`（深色工作台身份 + 五条设计原则）、`docs/specs/light-theme/design.md`（浅色令牌）。
> 触发：产物预览里那份中文 JSON 调研结论——满屏等宽灰字、带行号、横向溢出。

---

## 0. 发现访谈的决策记录

| # | 问题 | 决定 |
|---|---|---|
| ① | 一个形态还是两档 | **一个组件、两档形态**：`snippet`（对话）/ `document`（产物） |
| ② | 行号 | **产物去掉、代码保留** |
| ③ | 长行 | **产物折行、代码横滚** |
| ④ | 中文用不用等宽 | **结构用等宽、中文值用正文字体** |
| ⑤ | 高亮实现 | **lowlight core + 按需注册语法**；手写分词器删掉 |
| ⑥ | 着色强度 | **document 弱着色（三档）、snippet 完整（五档 + 注释）** |
| ⑦ | 外壳 | **document 去壳、snippet 留轻壳** |
| ⑧ | 语言标签 / 复制 | **产物隐标签、复制悬停浮现**；代码片段保留语言名 |

---

## 1. Feature Summary

`CodeBlock`（`packages/genui/src/components/`）同时服务两个性质相反的场合：对话里的代码围栏（几行片段，气泡内）和资产库的产物预览（30–60 行中文 JSON 调研结论，面板主内容）。它现在只有一种形态，于是两边都不合身——尤其是产物那边，一份**给求职者读的调研结论**被渲染成一份**给工程师审的数据结构**。这次拆成两档形态，并把高亮交给 lowlight。

## 2. Primary User Action

- **document**：求职者在产物预览里**读懂这份调研说了什么**——不是审阅一段 JSON，是读一份结论。
- **snippet**：用户在对话里**看清一段代码并整段拿走**。

## 3. Design Direction

一句话概括这次重构的判断：**代码块的默认审美来自代码编辑器，而我们这里九成内容不是代码，是中文句子。**

行号、等宽字体、横向滚动、语法配色——这四样在 VS Code 里都是对的，因为那里的内容是代码、读者是在定位和调试。产物预览里三样都是错的：没人会说「第 14 行写着什么」，中文在 mono 栈里字距松散，而一句中文长句横着跑出屏幕就是读不完。**承认这一点，就是这次重构的全部。**

对应 `.impeccable.md`：

- **原则①「画布是舞台，对话是旁白」** → 产物预览是那个面板的**正文**，不是面板里的一张卡。所以 `document` 去壳。
- **「少 border / 减少割裂」** → 标题栏 + 圆角 + `shadow-card` 叠在已有面板里就是卡中卡。
- **「呆萌外表·靠谱内核」的语气纪律** → 「JSON」这个标签对求职者是技术噪音；它不该是他读一份调研结论时看到的第一个词。
- **深色工作台 + sky 点缀** → 配色仍走既有令牌（`--accent-ink / --green / --orange / --ink / --ink-3`，取自 `_vendor/CodeBlock.tsx` 的 `COLORS`），浅色主题自动跟随。**不接受高亮库自带的主题。**

## 4. Layout Strategy

### 4.1 两档形态的分工

| | `snippet`（对话围栏） | `document`（产物预览） |
|---|---|---|
| 容器 | 轻壳：下沉底色 + 圆角，需要从正文里跨出来 | **无壳**：直接是面板正文 |
| 标题栏 | 保留（语言名 + 复制） | **无**；复制悬停时浮现在右上角 |
| 行号 | 有 | **无** |
| 长行 | 横滚（折行会打乱缩进层次） | **折行**，续行对齐到开引号而不是顶到最左 |
| 字体 | 全等宽 | **结构等宽 + 中文值用正文字体** |
| 着色 | 完整五档 + 注释 | **弱三档**：键（亮）/ 值（正文色）/ 结构与标点（暗） |
| 字号 | 12.5px / 1.75 | 13.5px / 1.8（它是要通读的） |

### 4.2 为什么 document 的续行要对齐到开引号

```text
错（顶到最左，读者分不清这是续行还是新键）
  "scope": "字节跳动官网公开的2027届前端岗位：抖音平台产品、
抖音体验与效能、今日头条、APM。"

对（续行缩进到值的起点）
  "scope": "字节跳动官网公开的2027届前端岗位：抖音平台产品、
            抖音体验与效能、今日头条、APM。"
```

实现提示：`white-space: pre-wrap` + 每行一个带 `text-indent: -Nch; padding-left: Nch` 的悬挂缩进，N 由该行前导空格数推出。**不要靠 JS 重新排版字符串**——那会让复制出来的内容和看到的不一致。

### 4.3 混排字体的边界

只有**字符串内容里的 CJK** 走正文字体；键名、标点、括号、数字、英文标识符全部保持等宽。判据是字符不是 token 类型——一个中英混排的值（`"Node/桌面端"`）里，英文那段仍应等宽，否则同一个值里出现两种字宽反而更乱。

实现提示：`font-family` 用「等宽在前、正文字体兜 CJK」的栈即可，让浏览器按字符回落，不要手动切分字符串。

## 5. Key States

### 5.1 document

| 状态 | 界面 |
|---|---|
| 正常 | 无壳、折行、弱三档着色 |
| 超长（60 行以上） | **全高展开，跟随面板自身滚动**。不做内部限高——它已经在一个可滚动面板里，再加一层就是嵌套滚动 |
| 极短（一两行） | 同正常。不因为短就换形态，形态由调用方声明 |
| 空对象 `{}` | 照常渲染。空产物是**产物侧**的问题，不该由渲染层假装 |
| 非 JSON 的结构化内容 | lowlight 认不出的语言 → 退回纯文本 + 弱着色，不猜 |

### 5.2 snippet

| 状态 | 界面 |
|---|---|
| 正常 | 轻壳、行号、横滚、完整五档 |
| **流式写入中** | 围栏未闭合时 `Markdown.tsx` 会把光标标记解析进来（`CodeRenderer` 的 `writing`）。高亮必须能吃**语法不完整**的输入——未闭合的字符串不能把后面整段染成字符串，未闭合的块注释不能吞掉剩余全文 |
| 无语言标注 | 走 `Markdown.tsx` 现有的行内 `<code>` 分支，不进 CodeBlock。本组件不处理 |
| 单行 | 行号仍显示（`1`），不因为只有一行就特殊化 |
| 超长单行 | 横滚；滚动条不能盖住最后一行 |

### 5.3 两档共用

| 状态 | 界面 |
|---|---|
| 复制成功 | 图标换 ✓、文案换「已复制」，1.5s 后还原（现有行为，保留） |
| 复制不可用 | `navigator.clipboard` 在非安全上下文不存在。现在 `.then()` 会直接抛。**要么捕获后提示、要么不渲染按钮**——一个点了没反应的按钮比没有按钮更糟 |
| 语言未注册 | 退回纯文本渲染，**不报错、不留空**；语言标签仍显示原始字符串 |
| reduced motion | 复制态切换不带过渡 |

## 6. Interaction Model

- **复制**：`snippet` 常驻标题栏右侧；`document` 悬停容器时在右上角淡入（`opacity` 150ms），键盘 focus 时同样出现——**不能只靠 hover**，否则键盘用户永远够不着。
- **横滚**（snippet）：容器 `overflow-x: auto`，行号栏 `position: sticky; left: 0` 钉住，否则横滚时行号会跟着跑掉。
- **选择与复制**：行号必须 `user-select: none` 且 `aria-hidden`——手动框选整段代码时不能把行号一起选进去（现有实现已做，保留）。
- **动效纪律**：沿用 `.impeccable.md`——轻、快、贴着元素，仅 `transform` / `opacity`，不弹跳。这个组件本身不需要入场动画。

**可及性**
- 代码容器 `role="region"` + `aria-label`（语言名或文件名），让屏幕阅读器能跳过一整块代码。
- 横滚容器需要 `tabindex={0}` 才能用键盘滚动。
- 弱着色的三档在**深浅两套主题**下都要过 AA：`document` 的值用 `--ink-2`，键用 `--ink`，标点 `--ink-3`——`--ink-3` 承载的是标点不是内容，可放宽到 AA Large。

## 7. Content Requirements

沿用现有 i18n，无新增键：`aiLab.chat.copy` / `aiLab.chat.copied`。

**语言标签的归属要理顺**：`LANG_LABEL`（`ts → TypeScript`）现在住在 `apps/web` 的 `Markdown.tsx` 里，而组件在 `packages/genui`。lowlight 的语言注册表也在包里。两处各有一张语言表、且不在同一个仓层——建议把「短名 → 显示名」并入 genui，与语法注册表放在一起，`Markdown.tsx` 只传原始短名。

**现实取值范围**（按这个量设计，不要按理想值）
- document 行数：3 / 30 / 120
- document 单行长度：中文值常见 20–80 字，最长可达 300 字（`snippet` 字段上限 1200）
- snippet 行数：1 / 8 / 40
- 语言：`LANG_LABEL` 现有 13 种；lowlight 建议注册 json / ts / js / python / bash / sql / yaml / css / html 九个

## 8. 技术约束：高亮实现

**删掉手写分词器**（`packages/genui/src/components/codeHighlight.ts`，本会话上一轮加的）。它用一张跨语言共享的关键字表近似所有语言——能跑，但跨语言必然细微地错，而且是一份没人会维护的表。

**改用 `lowlight`**（highlight.js core + 按需注册语法）。选它不是因为最小，是因为**配色归属权**：

| 库 | unpacked | deps | 为什么不选 |
|---|---|---|---|
| **lowlight** | 58KB core | 3 | ✅ 返回 hast，class 可映射到我们自己的令牌 |
| sugar-high | 81KB | 0 | 只懂 JS 语法族；python / shell / sql 会退化成纯文本 |
| prism-react-renderer | 717KB | 2 | 主题是 JS 对象，要再包一层才能用我们的 CSS 变量 |
| shiki | 589KB + `@shikijs/*` ×5 | 8 | 最准，但异步 API（组件要处理加载态）+ 需自写一份 VS Code 主题 |
| @codemirror/view | 1.2MB | 4 | 真编辑器，只做渲染是杀鸡用牛刀 |

> 注意 highlight.js 的 5.4MB 是**全部 190+ 语言**；`lowlight/lib/core` + 九个语法进 bundle 的是 core ≈25KB + 每语法 1–4KB。
>
> `shiki@3` 与 `prismjs@1` 已在锁文件里，但来自 `apps/landing` 的 astro，`apps/web` **resolve 不到**——用哪个都是真新增依赖，这一条不构成偏向。

**hljs class → 令牌的映射**（这层映射是我们的，不用库的主题）：

| 令牌 | hljs class | snippet | document |
|---|---|---|---|
| `kw` | keyword, built_in, type, operator | `--accent-ink` | — |
| `str` | string, regexp, char | `--green` | `--ink-2` |
| `num` | number, literal | `--orange` | `--ink-2` |
| `fn` | title, title.function_, attr, property, section | `--ink` | `--ink` |
| `com` | comment, quote | `--ink-3` | `--ink-3` |
| `dim` | punctuation, meta | `--ink-3` | `--ink-3` |

`document` 一列只有三种取值（`--ink` / `--ink-2` / `--ink-3`），这就是「弱三档」。

**不引 `hast-util-to-jsx-runtime`**：手写一个二十行的 hast 遍历即可，少一个依赖。

## 9. Recommended References

- **`typography.md`** — 等宽与正文字体混排、CJK 行高。这是本次最核心的一块。
- **`color-and-contrast.md`** — 六档令牌在深浅两套主题下的 AA 核验，尤其弱着色那三档。
- **`spatial-design.md`** — 两档密度的间距与节奏。
- **`interaction-design.md`** — 悬停浮现的复制按钮与键盘可达。

## 10. Open Questions

1. **hljs 大多数语法不发 `punctuation`。** 「标点压暗」这条设计可能对多数语言落空（JSON 尤其：hljs 的 json 语法只标 attr / string / number / literal）。实现时要实测，若确实拿不到，`dim` 这一档要么去掉、要么在 JSON 上自己补一步括号识别。
2. **续行悬挂缩进的实现方式**要拿真实中文长值验证——`text-indent` 负值方案在 CJK 换行点上的表现没试过。
3. **`document` 的字号 13.5px** 是估计值，要和面板里其余文字（标题 20px、元信息 12px）一起看才知道对不对。
4. **语言表跨包搬迁**（§7）是否本期做，还是先让 `Markdown.tsx` 继续传显示名。
5. `apps/web/src/app/mock/genui/page.dev.tsx` 有 CodeBlock 的验收位，两档形态都该在那里各摆一个。
