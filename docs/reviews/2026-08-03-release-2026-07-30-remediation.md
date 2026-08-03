---
title: release-2026-07-30 评审整改
type: review
status: Accepted
owner: kaihuang
created: 2026-08-03
updated: 2026-08-03
summary: PR #164 深度评审确认的缺陷分级与修复计划——自定义 section 渲染重复、内置 section 可被永久删除、icon 字段出厂即丢、登录后开放重定向。
scope: [apps/web, packages/resume-templates, packages/resume-schema]
repos: [Magic-Resume]
related: [architecture/overview.md]
---

# release-2026-07-30 评审整改

对 `release-2026-07-30 → master`（PR #164，12 个提交 / 117 文件）的多轮评审结果。
本期功能包括：自定义 section 成为一等公民、section 图标、customFields、头像上传到
R2、账单页与订单历史、6 个新模板、三份法务文档。

缺陷集中在**自定义 section 这条链路**——它横跨 schema、store、编辑器、HTML 渲染器、
PDF 渲染器五层，而每一层对"什么是自定义 section"的判定并不一致。

## 分级依据

- **P0** — 影响存量数据或线上用户：数据永久丢失、安全漏洞、存量简历显示错乱。
- **P1** — 本期新功能不可用或给出误导性结论，但不损坏既有数据。
- **P2** — 边界输入下崩溃、双端不一致、可维护性。

---

## P0-1 · 侧栏 section 在主栏被重复合成，标题打印裸 i18n key

**文件**：`packages/resume-templates/src/renderer/MagicResumeRenderer.tsx:246`
（PDF 同款：`packages/resume-templates/src/pdf/MagicResumePdfDocument.tsx:214`）

**根因**：`sectionComponents` 只从 `mainComponents` 过滤而来（第 243 行已排除 sidebar），
第 252 行却拿它去匹配 `sectionOrder` 的每一项。于是**任何被模板放在侧栏渲染的 section
都匹配不上**，落进 `synthesiseCustomSection`，在主栏又合成一份 `ListSection`。

叠加第二个错误：合成时 `title` / `titleZh` 都取 `sectionOrderItem.label`，而内置
section 的 label 是 i18n key，且非空的 `titleZh` 会绕过 `ZH_TITLE_BY_SECTION_KEY` 映射
（第 318 行）。结果重复出来的那块标题**字面显示 `sections.skills`**。

**影响**：19 个模板中 8 个受影响（azurill / chikorita / gengar / orange-modern /
teal-professional / golden-elegant / slate-sidebar 把技能、语言各印两遍；bronzor 印出
它刻意省略的 languages / certificates）。编辑器预览、导出 PDF、公开分享页三处全中，
且命中**所有存量简历**。

**修法**：匹配时要覆盖全部已声明组件（主栏 + 侧栏），只有两者都没有才合成。同时让合成
出来的标题走与内置一致的翻译路径：内置 key 不写 `titleZh`，交回 `ZH_TITLE_BY_SECTION_KEY`。

**验证**：`verify-custom-sections.tsx` 的 fixture 原先只有 `experience` + 一个自定义
section，这正是它当初漏掉本缺陷的原因——补上会被模板放进侧栏的 `skills` / `languages`
（label 用真实的 i18n key），再加三条断言：技能/语言不得重复出现、输出不得含
`sections.` 字面量。**在修复前的代码上跑，精确复现 8 个模板失败**，与评审实测一致。

**额外发现（自查得出，不在评审报告内）**：修复后仍有 1 个模板失败——`azurill` 的配置里
`sections.languages` 被声明了**两次**（侧栏 `languages-compact` + 主栏
`languages-timeline`），属模板配置自身的重复声明。已删除主栏那条冗余声明；并扫描全部
19 个模板确认无第二例。

## P0-2 · `profiles` 被判为自定义 section，可被永久删除

**文件**：`apps/web/src/lib/utils/resumeSectionOrder.ts:59`

**根因**：`isCustomSection` 用 `DEFAULT_LABELS` 判定，而它来自只有 7 项的
`DEFAULT_SECTION_ORDER`（basics / projects / education / skills / languages /
certificates / experience）。`packages/resume-schema` 的 `defaultSectionKeys` 却包含
**`profiles`**——每一份用 `defaultResume` 创建的简历都有它，19 个模板中 14 个声明了
`sections.profiles` 组件。`isCustomSection('profiles')` 返回 `true`。

**影响**：用户能在 `profiles` 上看到重命名/删除按钮。点删除后 `removeCustomSection`
同时抹掉 `sections.profiles` 与其 `sectionOrder` 条目，而
`normalizeResumeSectionOrder` **无法恢复**（它不在 `DEFAULT_SECTION_ORDER` 里，
sections 那边也已不存在），随后同步到云端。**永久数据丢失。**

> 评审报告称 `summary` 也是被漏掉的内置——经核实不成立，`summary` 不是 section key，
> 只有 `profiles` 是真漏。

**修法**：内置判定改为以 `packages/resume-schema` 的 `defaultSectionKeys` 为唯一真源，
不再依赖前端各自维护的一份列表。

**验证**：`isCustomSection` 对 `defaultSectionKeys` 的每一项都返回 `false`。

## P0-3 · `sectionOrder[].icon` 出厂即丢

**文件**：`apps/web/src/lib/utils/resumeSectionOrder.ts:35`

**根因**：`normalizeResumeSectionOrder` 的 `add()` 把每一项重建成
`{ key, label }` 字面量，本期新加的 `icon` 字段直接被丢弃。

**影响**：三条持久化路径全都要过它——`setSectionOrder`（每次拖拽）、
`getSanitizedResume`（每次 IndexedDB 写入 + 每次脏检查）、`importResume`。选完图标一
拖就没；更隐蔽的是只改图标时脏检查哈希不变，`syncToCloud` 判为 no-op，**永远同步不到
云端**。本期的 icon 功能等于出厂即死。

`apps/web/src/lib/utils/importResume.ts` 的 Zod schema 是裸的
`z.object({key,label})`，导入时会先把 `icon` 剥掉，需一并修。

**修法**：`add()` 保留 `icon`；导入 schema 补上 `icon`。

**验证**：单测——带 icon 的 `sectionOrder` 过一次 normalize 后 icon 仍在；
`getSanitizedResume` 前后的 `syncCompareKey` 在只改 icon 时发生变化。

## P0-4 · 登录后开放重定向（编码空白字符绕过）

**文件**：`apps/web/src/components/auth/afterAuthUrl.ts:23`

**根因**：守卫只拒绝字面量 `//` 与 `/\` 前缀，但浏览器的 URL 解析会**剥掉 ASCII
制表符/换行/回车**。`redirect_url=%2F%09%2F%2Fevil.com` 解码成 `/\t//evil.com`，以 `/`
开头、既不是 `//` 也不是 `/\`，原样返回；`SignInCard` / `SignUpCard` 把它交给
`router.push()`，`new URL(href, location)` 剥掉制表符后落到 `https://evil.com/`。
`%0A`、`%0D` 同理。该值还会作为 `redirectUrlComplete` 传给 Clerk。

**修法**：不再做前缀字符串匹配，改为剥离所有 C0 控制字符后用 `new URL(target, base)`
解析，比对 origin 是否同源；不同源一律回落默认值。

**验证**：`app.test.ts` 现有用例覆盖了 `//`、`/\`、`https://`、`javascript:`，
补齐 `%09` / `%0A` / `%0D` 三个变体。

---

## P1（本期新功能不可用 / 误导用户）

| # | 文件 | 症状 |
|---|---|---|
| P1-1 | `apps/web/src/app/billing/return/page.tsx:42` | `settle()` 只在 `paid` 时终止，`failed` / `refunded` 会一路走到 60s 超时面板，对已明确失败的支付显示「款项不会丢失，渠道会重试」 |
| P1-2 | `apps/web/src/store/useResumeStore.ts:872` | `customSectionKey` 只对 `sections` 去重，而 `basics` 从不在 `sections` 里 → 标题填「Basics」会铸造出保留 key，`sectionOrder` 出现两个 `basics`，dnd-kit 拖错行、BasicForm 渲染两次，且两条都删不掉 |
| P1-3 | `apps/web/src/store/useResumeStore.ts:901` | `updateCustomSection` 的 no-op 守卫用 `(patch.icon ?? current.icon) === current.icon`，导致「清除图标」永远无效，并连带吞掉同时进行的重命名 |
| P1-4 | `apps/web/src/middleware.ts:4` | 直接读 `process.env.NEXT_PUBLIC_APP_MODE` 并默认 `self-hosted`，而全站其余部分按 Clerk key 自动探测 → 在文档推荐的部署方式下 `/billing(.*)` 保护完全失效 |
| P1-5 | `apps/web/src/app/api/uploads/avatar/route.ts:102` | R2 object key 是 `avatars/${userId}.jpg`（按用户），而 `info.avatar` 是按简历的字段 → 一份简历换照片会覆盖账号下所有简历的照片；本期新增两个证件照模板让这个场景变成常态 |

## P2（边界崩溃 / 双端不一致）

| # | 文件 | 症状 |
|---|---|---|
| P2-1 | `apps/web/src/lib/constants/dynamicFormFields.ts:78` | 用简历数据当 key 索引对象字面量，`??` 只挡 null/undefined，继承自 `Object.prototype` 的成员是真值 → 标题「Constructor」的 section 让 `formFieldsFor` 返回 `Object`，`.map` 抛错打空整个编辑器左栏。`sectionIcons.ts:71`、`OutlineRail.tsx:52` 同款 |
| P2-2 | `packages/resume-templates/src/pdf/MagicResumePdfDocument.tsx:690` | `ItemCustomFields` 缺 `Array.isArray` 守卫，而同期加的两个 HTML 孪生实现都有 → 手写 JSON 把 `customFields` 写成对象时，预览静默跳过而导出 PDF 抛错，两端结论不一致 |
| P2-3 | `packages/resume-templates/src/renderer/MagicResumeRenderer.tsx:279` | `sortedComponents` 的 memo 依赖是 `[components, data.sectionOrder]`，函数体却读 `data.sections` → 「这个自定义 section 是空的」被缓存，之后填了内容也不显示 |
| P2-4 | `apps/web/src/components/account/billing/SubscriptionCard.tsx:49` | `Intl.DateTimeFormat().format(new Date(...))` 无守卫，Invalid Date 抛 RangeError 打掉整个账单 tab；同功能的 `OrderHistoryTable.formatDate` 守卫是对的 |
| P2-5 | `packages/resume-templates/src/templateLayout/skill-level.ts:27` | 按数值大小猜量表，1-10 评分被当成百分比（填 8 → 8% 进度条）；子串兜底让 `AWS EC2` 匹配到 CEFR 的 `c2` |
| P2-6 | Timeline / CompactList / ThreeColumnSection / InlineKeyValueSection | 四种布局不渲染 `customFields`，而编辑器对所有 section 的所有条目无条件挂了 CustomFieldsEditor → 用户填了、存了、同步了，预览和 PDF 里都不出现 |

## 本次不做

- **6 个新模板缺 `apps/web/public/templates/jpg/{id}.jpg` 缩略图** —— 需要美术产出，
  不是代码问题；但 `/api/templates` 与 MCP 的 templates 资源现在会返回 404 链接，
  应单独跟进。
- **英文法务文档正文未写** —— `/legal/en/*` 路由壳存在但无内容，且所有链接点都硬编码
  中文路由。需要法务文案，不在工程范围。
- **`customFields` / `icon` 未进 `packages/resume-schema`** —— 两者只在 apps/web 与
  resume-templates 里声明，`resumeJsonSchema` 不描述它们，MCP agent 因此看不见，
  `reorder_sections` 补丁会抹掉全部 icon。属于 schema 层设计，另开 spec。

## 执行进度

**第一批已完成**（分支 `fix/review-remediation-2026-08-03`）：

| 条目 | 状态 |
|---|---|
| P0-1 侧栏 section 重复合成 | 已修（HTML + PDF 两端）+ 回归断言 |
| P0-1 附带 · azurill 重复声明 | 已修 |
| P0-2 `profiles` 可被删除 | 已修（拆出 `BUILT_IN_SECTION_KEYS`）+ 单测 |
| P0-3 `icon` 出厂即丢 | 已修（normalize + 导入 schema）+ 单测 |
| P0-4 开放重定向 | 已修（改 origin 比对）+ 3 个绕过变体单测 |
| P1-1 支付失败显示为等待 | 已修 + 中英文案 |
| P1-2 `basics` 保留 key 可被铸造 | 已修（`taken` 以内置集为种子）+ 单测 |

`lint` 零 warning（顺带清掉两处失效的 `eslint-disable`）、`tsc --noEmit` 通过、
`i18n:check` 通过、19 个模板渲染断言全过。

**待办**：P1-3 / P1-4 / P1-5 与 P2 全部条目。
