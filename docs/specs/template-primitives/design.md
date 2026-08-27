# 模板原语层 — 从封闭区块换成可组合原语

- **状态**: Implemented（第 0–5 期全部落地，核心层）/ 待接线（agent-service 的工具注册、apps/web 的设计面板 UI）
- **日期**: 2026-08-21
- **范围**: `packages/resume-templates`（编译器 + 双后端 + 预设）、`apps/web`（无改动）
- **兼容性红线**: 19 个既有模板**一行不改**，继续走 legacy 组件路径；`Resume` schema 不动

## 1. 背景

现在的模板系统**是主题系统，不是排版系统**。用户看到一份好简历想复刻，做不到。

三条实测根因：

1. **`ComponentType` 是封闭枚举**（`types/magic-dsl.ts`）。声明 15 项，实际只实现 10 项——
   `ClassicHeader` / `ClassicSection` / `ClassicSkills` / `Divider` 在注册表里根本不存在。
   模板作者只能配色、挪顺序、调栏宽。
2. **加一个组件要写两遍**。屏幕侧 `templateLayout/DefaultSection.tsx` 在 PDF 侧有孪生的
   `DefaultSectionBlock`，藏在 1151 行的 `pdf/MagicResumePdfDocument.tsx` 里，两份靠人手同步。
   **这才是枚举停在 10 项的真正原因。**
3. **正文不归模板管**。`WysiwygContent` 塞进全局 `.wysiwyg` 类，19 个模板在正文上长得一模一样。

第 2 条已经造成过线上事故：`summary` / `awards` 在导出的 PDF 里凭空消失——两个
`synthesiseCustomSection` 守卫逻辑相同但读的是**两张不同的表**。19 个模板里只有 3 个声明了
`sections.summary`，其余 16 个「屏幕上看得见，导出就没了」。已在第 0 期修复。

## 2. 架构：编译器 + Resolved IR + 两个薄后端

```
        模板树（作者格式，可序列化）
                  │
            Template Compiler        ← 唯一理解业务语义的模块
                  │
        Resolved Layout IR（渲染格式）
        ┌─────────┴─────────┐
        ▼                   ▼
    dom/ 后端            pdf/ 后端
    HTML + Editable      View / Text / Link / Image
```

**唯一的规则：渲染器不解释业务。** `each` 展开、`when` 求值、binding 解析、样式合并钳制、
URL 安全化、编辑锚点推导，全部在编译器里做完。语义只有一份，就没有第二份可漂。

### 为什么不照抄 Reactive Resume（查证后）

先纠正一个常见前提：**RR v5 已经不用无头 Chrome**，也迁到了 `@react-pdf/renderer`。
它走得更远——**只有一个视觉渲染器**，预览是 PDF.js 把真实导出的 blob 光栅化到 canvas
（`AnnotationMode.DISABLE`，无文本层、无法命中测试），靠 100ms 防抖 + 双缓冲 + 180ms 淡入掩盖延迟。

我们不能照抄，因为 **PDF.js 做不了就地编辑**（真正的 PDF 内容编辑要上商业 SDK）。

> **架构是被产品形态决定的**：要保就地编辑 → 屏幕侧必须是真 DOM → 必然两个后端 →
> 漂移只能靠测试兜。
>
> 佐证：调研的开源简历产品里，唯一有真正就地编辑的 Resuminator 保留了 Puppeteer——
> 因为可编辑面与打印面是同一份 DOM。

另外两条从 RR 直接抄来的：**数值钳制**（它的 Custom Styles 就是一套安全语义词汇表，
`fontSize [6,48]`、`lineHeight [0.5,4]`、`opacity [0,1]`）、**每模板代码量压到最薄**
（漂移量正比于每模板独有的代码量，它们的每模板 manifest 只有 14 行）。

## 3. 词汇表（调研 16 个系统后定稿）

调研范围：MJML / react-email / Puck / Craft.js / Builder.io / Plasmic / Adaptive Cards /
Slack Block Kit / Notion / Figma / Typst / Google Docs / ProseMirror·Lexical / OOXML / ODF / react-pdf。

### `each` / `when` 是属性，不是节点

**16 个系统里没有一个**把迭代或条件做成节点类型。原因正是 flex：
`Box(row) → Repeat → [3 项]` 给父节点的是**一个** flex 子元素而不是三个。
做成属性后 `{"type":"Box","each":…,"when":…}` 是一个节点，布局语义正确。

（命名注意：Typst 与 MJML 里 `repeat` 意为「重复填满可用空间」，所以用 `each`。）

### 节点（6）与属性

| 节点 | 说明 |
|---|---|
| `Box` | flex 容器，含逐边 border |
| `Text` | 一段文字，带 `role`（`title`/`sectionHeading`/`body`/`caption`） |
| `RichText` | 正文 HTML |
| `List` | **扁平式**，每项自带 `level` |
| `Image` · `Icon` | 图片 / 图标（两者失败路径完全不同，故分开） |

属性：`each` · `when` · `href` · `style` · `separator` · `spacing` · `keepTogether` · `section` · `fallback`

- **`List` 用扁平式**：调研里最经得起考验的三个格式（OOXML `w:ilvl`、Google Docs
  `nestingLevel`、Notion）全是扁平的。理由很实际——**没有需要配对开合的包裹节点，
  模型漏一个标签不会让整棵树坏掉**。
- **`separator` / `spacing` 是属性不是节点**：对生成模型来说，在已经写出来的那个节点上
  加一个布尔，比在正确位置插一个兄弟节点容易得多。而且 react-pdf 本来就没有 `Hr`。
- **`Box` 必须有逐边 border**：7 个组件把小节标题横线画成标题元素的 `borderBottom`，
  8 个模板在用；`red-accent` 的左侧强调条也是 `border-l-4`。这是最便宜也最容易漏掉的一条。

### 明确不加

`Table`（react-pdf 无表格原语，等于写两遍列宽测量）· `Fragment`（`each`/`when` 变成属性后不再需要）·
`Spacer` 节点 · SVG。

> **分页的处理方式变了（第 3 期）。** 第 1 期决定先不进词汇表，理由是：既有的
> `MagicResumePdfDocument` 是单个 `<Page>` 随内容长高、不分页，文件里 9 个 `wrap={false}`
> 全是惰性的，`render-pdf-smoke.mjs` 用 `/Count 1` 把这个选择钉死了；要用上分页得先
> **推翻单页决定**，那是独立决定，不该顺手带进来。
>
> 第 3 期的做法是**不推翻它**：`page` 是可选字段，缺省 `single` 就是既定行为，
> `paged` 只在模板显式声明时生效。既有 19 个模板与 `/Count 1` 的断言都不受影响。
> 见下文「分页」一节。

## 4. 样式：字典 + 引用数组

根上一张 `styles` 字典，节点写 `style: ["sectionHeading", { marginTop: 4 }]`。

**两个后端都免费**：HTML 得到一串 class；**react-pdf 的 `style` 本来就接受数组**。
这是 Figma（按 id 引用）与 OOXML（`pStyle` + 直接覆盖）共同的模型。

反面教材有实证：**Builder.io 把 `responsiveStyles` 内联在每个块上，结果内容条目撞到
~1MB 上限保存失败**，官方文档专门写了一节教人「把重复抽进 Symbol」。

### 单位：IR 的长度一律是 CSS px

**必须显式规定，因为两个后端的原生单位不同**：DOM 拿到数字补 `px`，react-pdf 拿到数字当**点**用。
同一个 `fontSize: 10`，PDF 里会大 33%——而且一致性测试比的是数值（`10 === 10`），**看不出单位差**。

换算收口在 `pdf/renderNode.tsx` 的 `toPdf()` 边界上，依据是 `style.ts` 的 `LENGTH_KEYS`。
不在此列的 `lineHeight`（无单位倍数）、`opacity`、`flexGrow` 乘 0.75 会直接改坏语义。

### 字体：实测的三条（与直觉不同）

| 写了什么 | react-pdf 的实际行为 |
|---|---|
| 未注册的 `fontFamily` | **抛** `Font family not registered` |
| 未注册的 `fontStyle: 'italic'` | **抛** `Could not resolve font for …` |
| 未注册的 `fontWeight`（如 500） | **静默回落**到最近的已注册字重 |

> 早前本文写过「未注册的字重会 throw」——**实测证伪**。字重是静默回落的，
> 抛的是字体族与 `fontStyle`。

于是两个约束的理由各不相同：

- **`ALLOWED_FONT_WEIGHTS = {400, 700}`** 挡的是**静默漂移**，不是崩溃：浏览器把 500
  渲成 medium、PDF 回落到 400，两边看起来不一样却都不报错。语义一致性测试也抓不到
  （两边 IR 里携带的都是 500，比对相等）。白名单是这条漂移唯一的防线。
- **`fontStyle: 'italic'`** 才是会崩的那个，而且代价最大：用户正文里打一个斜体
  （编辑器的 `<em>`），字体族没有 italic 面 → **整份 PDF 导不出来**。编译期挡不住
  （那时不知道运行时注册了哪些面），所以防线是两道：注册端每个族都补 italic 变体
  （没有真斜体的就指向正体文件，`pdf/browser.tsx` 已经这么做了），
  自检端真渲染一遍、在用户点导出**之前**发现。

## 5. 就地编辑的契约

`EditableCanvas` 要求每个可编辑字段提供 `{sectionKey, itemId, fieldKey, kind, label}`：

- **`itemId` 必须是真实稳定的 `item.id`**，不能是数组下标——渲染会过滤隐藏条目，下标不稳定
- **`fieldKey` 必须是顶层可赋值属性名**。`resumePatch.ts` 做的是 `items[index][fieldKey] = …`，
  **不解析路径**。给 `'meta.summary'` 会凭空创建一个字面量属性、编辑丢失
- 包裹层必须 `position:relative` 且**不能有 `overflow:hidden`**——手柄在字段左边缘外 6px，
  被裁掉就等于就地编辑消失
- **没有 id ⇒ 静默退化成只读**。原语层至少要留下诊断（legacy 连诊断都没有）

`label` 由编译器合成（「工作经历 · 第 2 条」），不让作者填：只有编译器同时知道分区名和
**展开后的序号**，让作者写等于让他去猜一个运行期才存在的数。

区块级的 `SectionHandle` / `SectionInsertSlot` 由 Box 上的 `section` 属性声明。
放进 IR 是为了让「有没有」变成模板显式声明的一件事——现有 6 个区块组件里 5 个有，
`CompactList` 没有，于是 `skills-first` / `slate-sidebar` 两个模板里 AI 提不了「加一项技能」。

## 6. 数据兼容

`Resume` schema 不动。取值统一走 `fieldAccess.ts`（第 0 期新建）：

- ⚠️ `getFieldValue` 原本两份实现**就不一致**：屏幕用 `lodash.get` 且 `if (value)` 会跳过
  `0`/`false`/`''`；PDF 用 `path.split('.')` 且保留 `0`/`false`。现已合并为一份
  （保留 `0`，跳过 `false`）。
- ⚠️ `safeHref` 原本**只有屏幕侧有**。PDF 的 `safeWebsiteUrl` 是三行前缀拼接，没有拒绝路径——
  `javascript:alert(1)` 会变成 `https://javascript:alert(1)` 并生成一个活的 `<Link>`。已收口。

**路径解析三级回落**（顺序承重）：迭代变量名 → **当前条目属性** → 简历根。
第 2 级不是糖：binding 本来就相对条目，若 `each` 只认根路径，`each: {path:'customFields'}`
会**静默取到零项**，不报错、不警告，版面上只是少一块。

**自定义分区**：模板不声明时渲染器自动合成。树里必须有 catch-all（`$unhandledSections`），
校验期给警告——没有它，用户自建的分区**静默消失**，比崩了更糟。

## 7. 版本与降级

抄 Notion 与 Adaptive Cards：

- **根上一个 `version`，不要每节点一个**——Lexical 明确后悔过每节点版本号：
  它不与子类组合，基类升版会让子类无处记录自己的版本
- **每个属性都可选、都有默认值**，永远
- **两个后端从第一天就有 `unknown` 分支** + 节点级 `fallback`。
  先小后大是安全的，**前提是未知类型能优雅降级**；没有降级的「先小」才会逼出破坏性迁移
- Notion 的规则：向后兼容 ⟺ 新代码能处理旧数据。安全：加可选字段、删字段、放宽类型；
  不安全：加必填、收窄类型、删联合成员
- **不要把树规范化成扁平 id 表**（Puck 的 zones→slots 就是为此返工，Craft.js 是反面样本）

## 8. 绞杀榕与 legacy 冻结

`ComponentDefinition.tree` 有值就走新路径，否则走 legacy 注册表。**两个渲染器同一个判断**——
只改一边就又造出一对孪生实现，而那正是 `summary`/`awards` 事故的成因。

legacy 与原语层**永久共存**，但规矩是：**legacy 只修 bug，不长新功能。**
这条规矩靠自觉守不住（改一个旧组件总比新增一棵树省事），所以
`scripts/check-legacy-freeze.mjs` 把它变成一次会失败的构建（12 个纯 legacy 文件的哈希清单，
已接进 `npm test`）。真要改：`npm run freeze:update` 并在提交信息里写清原因——
有意的摩擦，不是禁令。

**不冻结**：两条路共用的 `WysiwygContent` / `utils` / `sectionIcons`，以及持有分发接缝的
`MagicResumeRenderer`。

## 9. AI 复刻模板（第 4 期，已实现 `replicate.ts`）

⚠️ **schema 校验远远不够**。业界实测：**结构化输出保证 schema，不保证质量**——
某管线 schema 合法率 99.4%，但约 11% 分类是错的，因为受约束解码屏蔽掉模型偏好的 token 后，
它塌陷到了能满足语法的安全默认值。**加严 schema 有时反而制造问题。**

所以走 `render → critique → revise` 闭环（UI2Code^N / VisRefiner 有论文支撑）。
**对我们特别便宜——两个渲染器都是现成的，别人要为此起一个浏览器。**

### critique 查的五件事

| 查什么 | 不查会怎样 |
|---|---|
| 结构合法 | 树根本编译不出来 |
| **分区覆盖** | 好看的模板只绑了 experience，education **静默消失** |
| 可编辑字段用的是 binding | 就地编辑**静默变只读**，用户点了没反应 |
| 有 catch-all | 用户自建的分区**静默消失** |
| 真渲染 + 页数 | 导出时才发现字体没注册、内容溢出 |

**五件里有三件的失败模式是「静默消失」**——那正是这整层架构存在的理由。

> ⚠️ **覆盖检查必须分两档，这是写这一层时踩到的坑。**
> 兜底节点（`$unhandledSections`）**接不住内建分区**——`resolveEachItems` 对它显式跳过了
> `isBuiltInSection` 的那七个 key（legacy 世界里「模板没声明内建分区」被视为有意省略，
> 自动合成反而会把 i18n key 印在纸上）。所以内建分区必须逐个显式绑定，自建分区才可以靠兜底。
> 写成「有兜底 → 全覆盖」的话，一棵「写了兜底但漏绑 education」的树会**通过检查、
> 然后把 education 丢掉**——检查说通过、内容却没了，是最坏的一种失败。

### 分层

管线**模型无关**：调用方传 `generate` 回调进来。真正的模型调用（带视觉、带重试、带计费）
在 agent-service，这个包不该知道那些；反过来 critique 的确定性部分必须在这个包，
因为它依赖编译器、校验器和真渲染。

给模型的写作约束在 `REPLICATE_INSTRUCTIONS`——**schema 表达不了的规则都在那里**，
逐条带代价说明（「抄进去的后果：用户打开看到的是别人的经历」）。

### 树存在哪

`Resume.templateOverride`（`z.unknown().optional()`）。**不建模板表**——第一波要验证的是
「复刻出来的版式能用」，不是「模板能分享」。分享与画廊是独立的产品决定。

**存储侧不需要动后端**：`buildSyncDoc` 是 `{...resume}` 减 `versions` 的透传而非白名单，
整份简历 `JSON.stringify` 进单个 `content` 字段（不是列），所以没有 DB 迁移；
旁证是同样自由形状的 `customTemplate` 今天就在跨云同步存活。
**待确认一项**：Core 写入时是否用 Zod 重新校验 `content` 并剥掉未知键
（服务端要应用 JSON Patch 所以确实会解析，但 patch 应用本身不做 schema 校验）。

形状**不在 Zod 里再定义一遍**：校验在 `validateTemplate` 与 JSON Schema 里，
写第二份就是第二份会漂的定义。两个渲染器拿到坏树都降级成不渲染而不是崩，
所以「schema 放行、渲染层把关」是安全的分工。

## 9b. 设计模式（第 5 期，已实现 `edit.ts`）

画布上每个元素都带 `data-template-node`（第 1 期埋的 `templateNodeId`），点中就拿到了要改哪个节点。
`edit.ts` 提供对树的补丁：`setNodeStyle` / `setNodeText` / `setNodeHidden` / `moveNode` /
`removeNode` / `outlineOf`。

**改的是作者格式，不是 IR。** IR 是 `each` 展开后的结果——用户点中第 2 条经历的公司名，
改的应该是那个模板节点，于是三条一起变。若改 IR 就只有第 2 条变，而且重新编译就没了。
这也是 `instanceId` 与 `templateNodeId` **两个 id 都要**的原因：
就地编辑用前者定位到具体那一条，设计模式用后者定位到模板节点。

**不可变不是风格问题**：撤销栈靠「留住上一棵树」。原地改的话撤销栈里全是同一个对象的引用，
用户点撤销发现什么都没变——而这个 bug 只在他点撤销时才暴露。

三个具体决定：

- **覆盖永远压在 `style` 数组最后一位**，且末位已是内联对象就就地合并。
  「我明明调了却不生效」几乎总是覆盖顺序错了；不合并的话调二十次字号会堆出二十个对象。
- **绑定节点的文案改不动。** 那是用户的简历内容不是模板——从设计面板改会把某个人的
  公司名写死进模板，别人用这个模板就看到他的公司。改内容走就地编辑。
- **设计模式下不套 `Editable`，也不出区块手柄与插入槽。**
  就地编辑要「点文字 → 插入光标」，设计模式要「点文字 → 选中模板节点」，
  同一次点击做不了两件事。套了会出现「想调字号，结果进了编辑态」这种两边都不对的状态。

`moveNode` 只在同一个父节点内挪。跨父拖拽听起来更强，但会把「这个节点属于哪个分区」
变成可以被拖坏的东西（编辑锚点、`section` 声明都挂在祖先链上），而同级重排覆盖了
绝大多数真实需求。

## 10. 验证

**双后端一致性是本层架构唯一的系统性风险。** 做法是**语义比对**而非像素比对：
同一棵 IR 各过一个后端，抽「按顺序的文本流 + 每段关键样式」比对。像素比对会被字体渲染差异
淹没（阈值松了抓不到、紧了天天误报），语义比对能**精确指出**「第 3 段在 PDF 里丢了加粗」，
且不需要浏览器。

两个已知盲区，都写在测试里：

- **DOM 侧必须真的渲染**（`renderToStaticMarkup`）。可编辑节点的内容包在 `Editable` 组件里，
  文本在 props 上不在 children 上，光遍历元素树会把简历里最重要的那部分全漏掉。
- **富文本在 Node 里两边都展不开**，只能验载体不能验文字：DOM 侧 `WysiwygContent` 无 `window`
  时有意返回空 div（DOMPurify 跑不了，SSR 直出未净化 HTML 是 XSS 洞）；PDF 侧 `PdfRichText`
  是组件元素，解析发生在 `renderToBuffer` 里。图省事写成「两边都不含所以一致」就是**空对空的假绿**，
  把 RichText 节点整个删掉照样过。真正的正文比对由 `render-pdf-smoke.mjs` 与人工走查负责。

若语义比对压不住漂移，再上 RR 的做法（`@napi-rs/canvas` + `pixelmatch`）——CI 才需要浏览器，运行时不需要。

## 11. 分期

| 期 | 内容 | 状态 |
|---|---|---|
| **0** | 修 `summary`/`awards` 丢失 · `fieldAccess` 收口 · ErrorBoundary · `.wysiwyg` 样式 | ✅ |
| **1** | 词汇表 + 编译器 + 两个后端 + 一致性测试 | ✅ |
| **2** | 渲染器双分支 + `DefaultSection` 预设 + legacy 冻结守卫 | ✅ |
| **3** | JSON Schema + 样式归一化 + 溢出自检 + 分页模式 | ✅ |
| **4** | 复刻管线 + 树存在简历上（`Resume.templateOverride`） | ✅ 核心层 |
| **5** | 设计模式（树补丁 + 选中态 + 大纲） | ✅ 核心层 |

**「核心层」的意思**：这个包里的东西全部完成并有测试。还没接的两处在别的地方——
agent-service 里注册 `replicate_template` 工具（Magic-Core，另一个仓库），
以及 `apps/web` 里的设计面板 UI（视觉验收按项目惯例交用户）。

**第 3 期必须在第 4 期之前**——顺序反了就是拿用户的编辑器做实验。

### 样式归一化（已实现，`normalize.ts`）

一道 **ODF 式**的后处理：`office:automatic-styles` 的先例是——允许直接套格式，然后
**机器生成**具名样式并改写引用。我们照做：让模型随便内联，之后跑一个确定性后处理，
把相同样式对象哈希、提进字典、把节点改成引用。**模型好写、存储紧凑、diff 稳定，
三者都要，且不用调提示词。**

三条不变量都有测试钉住：**不改变渲染结果**（`compile(doc)` 与 `compile(normalize(doc))`
产出的 IR 逐字相同——一旦它能改变画面，就没人敢在保存路径上跑它）、**幂等**
（否则每次保存都产生假 diff）、**确定性**（名字按稳定的深度优先顺序分配，不用哈希做名字）。

### 分页（已实现，默认仍是单页）

`TemplateDocument.page` 可选，缺省 `{ mode: 'single', size: 'A4' }`——**等于既有 19 个
模板的行为**，所以老模板加不加这个字段都一样。`paged` 只在模板显式声明时生效，
届时 `keepTogether` 才有语义（`single` 下没有页边界，它是彻底惰性的）。

文档级入口 `primitives/pdf/document.tsx` 自己拥有 `<Page>`，供第 4 期「整棵模板树存在
简历上」使用。现阶段分区级预设仍渲染在既有 `MagicResumePdfDocument` 的 `<Page>` 里。
**先建好并测好，比第 4 期临时补要安全**：分页一旦上线会影响所有导出。

### 溢出自检（已实现，`overflow.ts`，Node/服务端专用）

真的 `renderToBuffer` 一次，回答「放得下吗、画得出吗」。**不能估算**——排版是文字度量的
函数，而 react-pdf 用自己的 textkit（我们还打着 `@react-pdf__textkit` 的补丁），
任何「按字符数估行数」的近似都会在最需要它的地方（内容刚好卡在页边界）出错。
而真渲染在这里很便宜：不需要浏览器。

报告含页数、字节数、是否超页、编译诊断，以及**渲染抛出的原始异常**——
字体族没注册、斜体没有对应面、图片取不到，全都在这里现形。

## 12. 顺带清理（调研发现的死物，尚未动）

- `ComponentStyle` 14 个属性里 6 个零使用：`margin` `marginTop` `marginRight` `marginLeft`
  `fontSize` `fontWeight`
- `border` 与 `boxShadow` 有人用但 PDF 直接丢（`toPdfComponentStyle` 只映射 8 个）。
  `ditto` 是卡片模板，8 个组件带边框和阴影——屏幕上是卡片，PDF 里是白底圆角块。
  `border` 能修，`boxShadow` 修不了（react-pdf 没有）
- `--color-secondary` 有个调色控件但零消费者——一个什么都不做的控件
- `layout.containerHeight` · `layout.sidebar` · `layout.type: 'sidebar'|'grid'` ·
  `FieldMapping.custom` · `version` · `createdAt/updatedAt` 全部无人读取

## 13. 当前落地清单

```
packages/resume-templates/src/
  fieldAccess.ts              取值 / 可写键 / URL 安全化（两个渲染器共用一份）
  sectionSemantics.ts         内建分区判定与中文标题（两张表合一）
  primitives/
    ast.ts                    作者格式
    ir.ts                     渲染格式（EditAnchor / SectionEditor）
    condition.ts              when 的结构化 DSL，永不抛
    style.ts                  白名单 / 钳制 / 字重白名单 / LENGTH_KEYS
    listMarkers.ts            列表符号与缩进，两个后端逐字共用
    roleStyles.ts             role → 视觉，两个后端共用
    compile.ts                编译器
    validate.ts               模板校验
    treeComponent.ts          绞杀榕接缝（两个渲染器共用）
    normalize.ts              ODF 式样式归一化（确定性、幂等、不改画面）
    schema.ts                 JSON Schema，给 AI 复刻的受约束解码
    overflow.ts               溢出自检（真渲染，Node 专用）
    dom/renderNode.tsx        DOM 后端
    pdf/renderNode.tsx        PDF 后端（px → pt 收口于此）
    pdf/document.tsx          文档级入口，拥有 <Page>，分页在这里
    replicate.ts              AI 复刻管线（模型无关）+ critique
    edit.ts                   设计模式的树补丁（纯函数、不可变）
    presets/defaultSection.ts 第一个预设
  server.ts                   服务端专用入口（吃 renderToBuffer 的那些）
  scripts/check-legacy-freeze.mjs   legacy 冻结守卫
```

**入口分两个**：主入口给浏览器，`@magic-resume/resume-templates/server` 给 Node。
`overflow` / `replicate` / `renderTreeDocument` 都吃 `renderToBuffer`，从主入口导出会把
react-pdf 的 Node 路径拖进浏览器包，而且浏览器里根本调不通（那边要用 `pdf().toBlob()`）。
分开是为了让「只能在服务端跑」变成 import 路径上看得见的一件事。

**清单类常量只有一份**，schema、校验器、类型三者都从它派生：`NODE_TYPES` /
`PAGE_SIZES` / `PAGE_MODES` / `ALLOWED_STYLE_KEYS` / `ALLOWED_FONT_WEIGHTS` / `CLAMPS`。
`ast.ts` 里两行 `extends ? true : never` 双向钉住清单与联合类型——少一项、多一项、
拼错一个字母都是编译错误。这不是洁癖：手抄的第二份枚举已经出过一次错
（schema 里写了 `'LETTER'`，类型里是 `'Letter'`）。

测试：`npm test` = lint + freeze + unit；另有 19 模板 PDF 冒烟（`npm run test:pdf`）。
`overflow.test.ts` 真的渲染 PDF，比其它单测慢一个量级，但只有它能回答「导出会不会炸」。
