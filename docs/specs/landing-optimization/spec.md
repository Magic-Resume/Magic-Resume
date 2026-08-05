---
title: Landing 优化方案（资产、首屏、SEO、语言路由、商业信息）
type: spec
status: Proposed
owner: kaihuang
created: 2026-08-05
updated: 2026-08-05
summary: apps/landing 视觉重构之后的第二轮优化——清理 4.35MB 死资产、把首屏 JS 移出关键路径、补齐结构化数据与可达性，并就默认语言、价格展示、社会证明三项做决策。
scope: [apps/landing]
repos: [Magic-Resume]
related: [../../../apps/landing/design.md]
---

# Landing 优化方案

> 一句话：视觉层已经按 `apps/landing/design.md` 重构完；这一轮解决的是**没人看得见但直接影响转化和自然流量的部分**——默认语言、部署体积、首屏成本、结构化数据。

## 实施状态（2026-08-05）

| 批次 | 状态 | 结果 |
|---|---|---|
| **P0-a** 301→302 + locale 埋点 | ✅ 已完成 | 重定向可改；UTM 新增 `utm_term=<locale>` |
| **P0-b** 资产 / 首屏 / CLS / a11y | ✅ 已完成 | 部署产物 **6.9 MB → 1.0 MB**；首屏关键路径 JS **72 KB → 0** |
| **P0-c** 结构化数据 + robots | ✅ 已完成 | 双语各输出 FAQPage(5 条) + SoftwareApplication |
| **P1** 语言路由 | ⏸ 阻塞于 D1 | — |
| **P2** 价格 / 社会证明 | ⏸ 阻塞于 D2 / D3 | — |

实施中新增两项发现，见 §11。

---

## 1. 现状基线（2026-08-05 实测）

所有数字来自当前 `dist/` 构建产物，不是估算。

| 维度 | 现状 | 问题 |
|---|---|---|
| 部署产物总体积 | **6.9 MB**，其中图片 6.1 MB | 4.35 MB 从未被任何代码引用 |
| OG 分享图 | `magic-resume-preview.png` **691 KB** | 社交平台抓取易超时，分享卡片出不来 |
| favicon / logo | `magic-resume-mark.png` **141 KB**，渲染尺寸 28×28 | 体积与用途差三个数量级 |
| 首屏 JS | **≈72 KB (gzip)** 在关键路径上 | `EditorMockup` 用 `client:load` |
| 结构化数据 | 无 JSON-LD、无 `robots.txt` | 页面有 5 条现成 FAQ，未被搜索引擎识别 |
| 默认语言 | `/` → `/en`（**301**），`x-default` → `/en` | 主力市场是中文 |
| CLS 风险 | 3 处 `<img>` 无 `width`/`height` | 含一张第三方外链图 |
| 可达性 | 无 skip link | 键盘用户每次需 Tab 过整个 nav |
| i18n | `hero.pill` / `previewAlt` / `logoAlt` 定义未引用 | 死文案 |

**架构事实（影响后续所有决策）：** landing 独占 apex `magic-resume.cn`（Vercel 静态部署），web 应用在 `app.magic-resume.cn`（`PUBLIC_WEB_ORIGIN`）。这与 `.plan/landing_astro_split.md` 的 D1（"Next 持有 apex + rewrite landing 路径"）**不一致**——实际走的是子域拆分。方案按实际架构写。

---

## 2. 目标与非目标

### 目标

1. 部署体积 6.9 MB → **< 1.5 MB**
2. 首屏关键路径 JS 72 KB → **0 KB**（岛内容已 SSR，交互延后水合）
3. Lighthouse SEO / Accessibility → **100**，Performance ≥ 95（移动端）
4. 中文访客进入 apex 后落到中文页（**待 D1 决策**）
5. 让"这东西多少钱"在页面上有答案（**待 D2 决策**）

### 非目标

- 不改文案。已通读 `zh.json`，质量高于常见水平，本轮只删死 key，不重写句子。
- 不改视觉设计。`apps/landing/design.md` 刚定稿并实施，本轮不动 token、排版、配色。
- 不引入 landing 端 analytics SDK。归因继续走 `dashboardLink()` 的 UTM，落到应用侧统计（见 §7.1 的例外：需要补一个 locale 维度）。
- 不动三个产品仿真岛的设计与行为。
- 不重写 `EditorMockup` 去 React 化（收益有限、风险高，见 §5.2 的备选评估）。

---

## 3. 决策门

以下三项无法由技术判断决定，需要拍板后才能进入实施。

### D1 — 默认语言（阻塞 P1 批次）

| 选项 | 做法 | 代价 |
|---|---|---|
| **A. 中文优先**（建议） | `defaultLocale: 'zh'`，`/` → `/zh`，`x-default` → `/zh` | 国际访客首屏是中文，需自行切换 |
| **B. 按 `Accept-Language` 分流** | Vercel `redirects` 的 `has` 条件匹配请求头，中文头去 `/zh`，其余去 `/en` | 配置略复杂；CDN 需按头分缓存；爬虫无头时落默认值 |
| **C. 维持英文优先** | 不动 | 中文主力用户第一屏是英文 |

**我的建议是 B，退而求其次是 A。** 理由：域名是 `.cn`、CLAUDE.md 写明"求职者以中文市场为主"，但项目本身是 MIT 开源、GitHub 是重要入口，英文入口有真实价值。B 两头都不牺牲，且 Vercel 静态部署原生支持，不需要引入 SSR 或中间件。

**⚠ 无论选哪个，都必须先做一件事**：`apps/landing/vercel.json` 里 `/` → `/en` 目前是 `"permanent": true`（**HTTP 301**），浏览器会长期硬缓存。**已经访问过 apex 的用户，即使我们改了配置也不会重新请求**——他们会一直被本地缓存送到 `/en`。因此第一步是把它降级为 302（`permanent: false`），让重定向变得可改；这一步独立于最终选 A/B/C，且越早做损失越小。

**另一个必须一并修的坑**：`/` 的重定向目前**定义了两遍**——`astro.config.mjs` 的 `redirects` 和 `vercel.json` 的 `redirects`。两处不一致时以平台层为准，是典型的静默漂移源。收敛到一处（推荐留 `vercel.json`，因为语言分流只有平台层能做）。

### D2 — 价格是否上 landing（阻塞 P2 批次）

现状：FAQ 里提到"免费额度""付费计划"，但页面无价格区块，访客要翻 FAQ 才知道有免费额度。

技术事实：套餐是 **Free / Pro**，价格与额度存在数据库里由 admin 后台管理，**不是代码常量**。因此若要在 landing 展示：

- 硬编码 → 必然与后台漂移，是个定时炸弹
- 构建期拉取 → 沿用现成的 `getStarCount()` 模式（landing 已经在构建时打 GitHub API），加一个 plans 接口调用即可。价格变了重新构建一次 landing。

**硬约束**：后端已确立"计量单位内部化"原则——对外只暴露**计划类型 + 是否够用 + 剩余百分比**。landing 的价格区块必须遵守，只能讲"免费额度 / Pro 无忧使用"这类表述，不要把内部计量数字搬到页面上。

三个选项：①不做（保持现状，靠 FAQ）；②轻量——Hero 下方或 FAQ 上方加一行"免费开始，Pro 按月订阅"+ 链接到应用内价格页;③完整 pricing 区块（构建期拉取真实套餐）。

**我的建议是 ②。** landing 的任务是把人送进应用，不是完成交易；完整价格表会把一个单焦点页面拉成两个焦点，而 Linear 式排版恰恰依赖每屏一个焦点。等有了第三档套餐或年付选项再上 ③。

### D3 — 社会证明（阻塞 P2 批次）

现状只有 GitHub star 数一项。可选补充：累计生成简历数、用户数、一句用户原话。

**需要你确认的是有没有数据可用、以及数字是否好看**——一个"127 位用户"的展示比不展示更伤。如果暂时没有拿得出手的量级，我建议维持现状，不要造。**示例数据不得使用真人信息**（这是仓库红线）。

---

## 4. P0 批次：无争议技术项

不依赖任何决策，可立即实施。以下每项都是纯增量或纯删除，零设计影响。

### 4.1 清理死资产

删除 `apps/landing/public/` 下 10 个从未被引用的 PNG：

```
magic-resume-brand.png    1316 KB    magic-resume-select.png    369 KB
magic-resume-optimize.png  843 KB    magic-resume-analysis.png  351 KB
magic-resume-chat.png      510 KB    anime-interviewer.png      347 KB
magic-resume-export.png    316 KB    magic-resume-import.png    228 KB
magic-resume-logo.png       48 KB    simple-logo.png             22 KB
```

来源判断：Astro 重写时从 `apps/web/public/` **搬运**（非复制）的残留——`apps/web/public` 现在只剩 `magic-resume-preview.png` 与 `magic-resume-mark.png` 两张。

**引用核查已完成（2026-08-05）**，十张图在整个 monorepo 里均为孤儿：

| 检查范围 | 结果 |
|---|---|
| `apps/landing/src` + `*.json` + `*.mjs` | 10 张全部 0 引用 |
| `apps/web/public` 是否有副本 / `apps/web/src` 是否引用 | 均无 |
| `README.md` / `README.zh-CN.md` / `apps/docs` / `docs` | 无引用 |

README 首图指向 `./apps/web/public/magic-resume-preview.png`，该文件存在，**不受本次删除影响**。

**风险**：低。唯一残留风险是外部文章热链了 `magic-resume.cn/magic-resume-*.png`，删除后 404。这些是内部资产不是公开 API，建议直接删。

### 4.1b 顺带发现：OG 图与 logo 在两个 app 里各存一份

`magic-resume-preview.png`（707 KB）与 `magic-resume-mark.png`（141 KB）**同时存在于 `apps/web/public` 与 `apps/landing/public`**，内容相同。

含义：4.2 的压缩若只做 landing 一侧，`apps/web` 的 OG 卡片与 README 首图仍然是 707 KB。两处都要压。

**是否合并成共享资产包**（如 `packages/brand-assets`）留作后续判断——两个 app 独立部署，各自持有副本并非错误，只是压缩时容易漏掉一边。本轮先保证两处同步压缩，并在 4.2 的验收里同时检查。

### 4.2 压缩在用图片

| 文件 | 现状 | 目标 | 做法 |
|---|---|---|---|
| `magic-resume-preview.png`（OG 图） | 691 KB | **< 200 KB** | 转 WebP + PNG 双份（部分社交平台不认 WebP，`og:image` 保留 PNG 但重压） |
| `magic-resume-mark.png`（favicon/logo） | 141 KB | **< 5 KB** | 换 SVG；若必须位图则输出 32/64/128 三档 |

`og:image` 还应补 `og:image:width` / `og:image:height`（社交平台据此预留卡片空间，缺失时部分平台不渲染大图）。

### 4.3 首屏 JS 移出关键路径

`apps/landing/src/components/sections/Hero.astro:76`：

```diff
- <EditorMockup client:load labels={h.mockup} lang={locale} />
+ <EditorMockup client:idle labels={h.mockup} lang={locale} />
```

**为什么安全**：已验证 `EditorMockup` 的内容在静态 HTML 里就存在（构建产物中可搜到"基本信息"等标签），Astro 已完成 SSR。JS 只负责交互与动画，延后水合的唯一可感知差异是模板切换/配色按钮晚一拍可用，框和内容立刻可见。

**为什么不是 `client:visible`**：Hero 在首屏内，IntersectionObserver 会立刻触发，与 `client:load` 差别不大；`client:idle` 才真正让出主线程。

**收益**：72 KB gzip（react-dom 182 KB + react 7.7 KB + 组件 18.8 KB + jsx-runtime，未压缩约 209 KB）从阻塞变为空闲期加载。另两个岛已是 `client:visible`，`motion`（123 KB）因此本就是懒加载，不在关键路径——这点原先判断有误，已核实。

**备选（不采纳）**：把 `EditorMockup` 改写成纯 CSS/Web Component 以彻底去掉 React。收益是省下 190 KB 下载，代价是重写 586 行交互逻辑并失去与产品真实 UI 的同构性——Product-Sim 层的价值恰恰在于"它就是产品本身"。不划算。

### 4.4 结构化数据与 robots

新增 `apps/landing/src/components/Seo.astro`（或直接在 `Landing.astro` 注入），输出两段 JSON-LD：

1. **`FAQPage`** — 直接消费 `copy.faq.items`，零额外维护成本。5 条问答已经写好，是最容易拿到富媒体结果的一处。
2. **`SoftwareApplication`** — `name` / `applicationCategory: "BusinessApplication"` / `operatingSystem: "Web"` / `offers`（若 D2 选 ②或③ 则填，否则省略 `offers` 而非填 0）。

新增 `apps/landing/public/robots.txt`：允许全站抓取 + 指向已有的 `/sitemap.xml`。

**注意**：JSON-LD 必须按 locale 生成两份（`/en` 与 `/zh` 各自的问答文本），不要只输出默认语言。

### 4.5 CLS 与可达性

| 项 | 位置 | 改法 |
|---|---|---|
| 图片无尺寸 | `Header.astro:24`、`Footer.astro:20`、`OpenSource.astro:67` | 补 `width`/`height` 属性 |
| 第三方图无兜底 | `OpenSource.astro:67`（`contrib.rocks`） | 固定容器高度 + `onerror` 隐藏；`contrib.rocks` 挂掉不应让版式抖动 |
| 缺 skip link | `Landing.astro` | `<a href="#top" class="sr-only focus:not-sr-only">` 置于 `<body>` 首 |

`contrib.rocks` 是渲染路径上唯一的第三方依赖。它慢或挂，贡献者区就空白。**可选加固**：构建期抓取并本地化该图（与 `getStarCount()` 同一模式），代价是贡献者更新需重新构建。**建议**：先做固定高度兜底，本地化留作后续。

### 4.6 清理死 i18n key

删除 `previewAlt`、`logoAlt`（en/zh 各一份）。

`hero.pill`（`"V1.0 · 开源内核"`）**建议启用而非删除**——Hero 标题上方一枚版本徽章符合 `design.md` §5.5 的 badge 规格，且能顺带传达"开源"这个核心卖点。属视觉新增，需你点头。

---

## 5. P1 批次：语言路由（依赖 D1）

分两步，第一步无论 D1 选什么都要做。

### 5.1 先把 301 降级为 302（立即）

`apps/landing/vercel.json`：`"permanent": true` → `false`。

单独发一次，让缓存尽早开始失效。**这一步的价值随时间衰减——越晚做，被 301 永久锁死在 `/en` 的用户越多。**

### 5.2 再按 D1 落地

选 A：改 `astro.config.mjs` 的 `defaultLocale`、`vercel.json` 的 destination、`Landing.astro` 的 `x-default`（三处必须同步，否则 canonical 与 hreflang 自相矛盾会被搜索引擎判为配置错误）。

选 B：`vercel.json` 加 `has` 条件的重定向规则（中文头 → `/zh`，兜底 → `/en`），并设置 `Vary: Accept-Language` 响应头保证 CDN 按语言分缓存。`x-default` 保持指向 `/en`（x-default 的语义就是"未匹配语言时的兜底"，与按头分流是一致的）。

---

## 6. P2 批次：商业信息（依赖 D2 / D3）

按决策结果实施，不在此展开。若 D2 选 ③（完整 pricing），需额外设计：构建期拉取失败时的降级渲染（不能因为 API 抖动就构建失败或显示空价格）。

---

## 7. 三维影响

### 7.1 商业

- **D1 是本方案唯一可能显著影响转化的改动。** 其余各项影响的是"能不能被搜到"和"打开快不快"，是慢变量。
- **⚠ 现在无法度量 D1 的效果。** `dashboardLink()` 携带 `utm_source/medium/content`，但 **`content` 只记录 CTA 位置（header/hero/cta_section/footer），不含 locale**。也就是说改完默认语言，我们分不出中文页与英文页各贡献了多少注册。
  **建议在 P0 就补上**：给 `dashboardLink()` 增加 locale 维度（如 `utm_term=zh`）。这是个 5 行的改动，但它决定了 D1 之后能不能验证决策对错——**先埋点，再改行为**。
- SEO 项（4.4）的收益周期以月计，且不确定；不要作为短期指标考核。

### 7.2 产品

- 4.3 的水合改动会让 Hero 演示的交互可用时间晚约一个空闲周期。对"看一眼就走"的访客无影响，对"想点点看"的访客可能出现点击无响应的极短窗口。**可缓解**：水合完成前给演示区一个极淡的 `cursor: default`，或干脆接受——这类营销演示的点击率本身很低。
- 删除 `previewAlt` / `logoAlt` 不影响可达性：对应 `<img>` 已是 `alt="" aria-hidden="true"`（装饰性图片的正确做法），本就不该有可读文案。

### 7.3 技术

- P0 全部为局部改动，无架构影响，可独立回滚。
- 唯一有长尾风险的是 4.1 的资产删除（外部热链 404）与 5.1/5.2 的重定向（301 缓存）。
- 本方案不新增运行时依赖；4.4 的 JSON-LD 是编译期字符串，零客户端成本。

---

## 8. 度量与验收

### 量化门槛

- [x] `du -sh apps/landing/dist` < 1.5 MB —— 实测 **1.0 MB**（原 6.9 MB）
- [x] `dist/*/index.html` 中 `client="load"` 计数为 0 —— 现为 1×`idle` + 3×`visible`
- [x] 首屏关键路径 JS = 0 KB —— 同步脚本只剩 ClientRouter，react-dom 已移出
- [x] OG 图 < 200 KB —— landing **75 KB**；`apps/web` **214 KB**（PNG 保留格式，见下）
- [x] favicon —— landing **15 KB**（原定 <5 KB，据实调整，见 §11.3）；`apps/web` **44 KB**
- [x] canonical / hreflang / sitemap / JSON-LD 四处地址一致（见 §11.1）
- [x] FAQ 结构化数据文本与页面可见文本逐字一致（Google 要求，不一致会被判作弊）
- [ ] Lighthouse 移动端：Performance ≥ 95、SEO 100、Accessibility 100、**CLS = 0** —— **待实测**
- [ ] Google Rich Results Test 对 `/zh` 与 `/en` 均识别出 `FAQPage` —— **待线上验证**

> `apps/web` 的 OG 图停在 214 KB 而非 200 KB 以下：它被 6 处代码以 `.png` 引用且兼作 README 首图，转 JPEG 或调色板量化会引入可见带状伪影。69% 的降幅已达目的，不为凑数字牺牲画质。

### 回归门槛（不得破坏上一轮成果）

- [ ] `apps/landing/design.md` §4.1 的 chrome 层合规 grep 仍为零命中
- [ ] `pnpm --filter @magic-resume/landing build` 与 `lint` 零错误
- [ ] `/zh` 与 `/en` 的 canonical / hreflang / `x-default` 三者自洽

### 人工验收

- [ ] 断网模拟 `contrib.rocks` 不可达，贡献者区不抖版
- [ ] 键盘 Tab：第一次 Tab 即出现 skip link
- [ ] 微信 / X 分享卡片能正常出图

---

## 9. 排期建议

| 批次 | 内容 | 前置 | 规模 |
|---|---|---|---|
| **P0-a** | 5.1 的 301→302 + 7.1 的 locale 埋点 | 无 | 极小，建议立刻单独发 |
| **P0-b** | 4.1 / 4.2 / 4.3 / 4.5 / 4.6 | 无 | 小，一次做完 |
| **P0-c** | 4.4 JSON-LD + robots | 无 | 小 |
| **P1** | 语言路由 | D1 | 小（配置层） |
| **P2** | 价格 / 社会证明 | D2 / D3 | 中，视选项而定 |

P0-a 单独先发，是因为 301 缓存与埋点缺失这两件事**越晚做代价越高**：前者每天都在把新访客永久锁进英文页，后者让我们在没有基线的情况下改行为。

---

## 11. 实施中的新发现

### 11.1 canonical 与 hreflang 曾经互相矛盾（已修）

首次构建后核对发现：`canonical` 输出 `https://magic-resume.cn/zh/`（**带尾斜杠**），而 hreflang 与 sitemap 都写 `/zh`（不带）。搜索引擎视两者为不同 URL，一个页面自称的规范地址不在自己的 hreflang 集合里，属配置错误且**不会报任何错**。

根因：Astro 的 directory 构建格式让 `Astro.url.pathname` 带尾斜杠，而 hreflang / sitemap 是手工拼的路径。

已在 `Landing.astro` 统一归一到无尾斜杠形式。现在 canonical / hreflang / sitemap / JSON-LD 四处地址完全一致——**这四处任何一处改动都必须同改其余三处**，建议作为回归检查项固化。

### 11.2 ⚠ `apps/web/src/components/shared/StructuredData.tsx` 含编造数据（未处理，需决策）

实施 P0-c 时为对齐既有实现读了这个文件，发现主应用输出的 JSON-LD 里有多处不实内容。**本轮未改动它**——它属 `apps/web`，超出本方案范围，且涉及对外声明，应由你决定。

| 位置 | 内容 | 问题 |
|---|---|---|
| `aggregateRating` | `ratingValue: "4.8"`、`reviewCount: "500"` | **无对应评价体系,数字是编造的。** Google 结构化数据垃圾政策明确禁止虚构评分,可触发人工处罚并使全站富媒体结果失效 |
| `sameAs` | `github.com/magic-resume`、`twitter.com/MagicResume`、`linkedin.com/company/magic-resume` | 真实仓库是 `github.com/LinMoQC/Magic-Resume`,这几个地址存疑 |
| `offers.price` | `"0"` + `"完全免费使用"` | 与现有 Free/Pro 双档订阅矛盾 |
| `offers.priceValidUntil` | `"2025-12-31"` | 已过期 |
| FAQ 答案 | `"准确率达到90%以上"`、`"完全免费"`、`"所有简历数据采用本地存储,我们不会收集或存储您的个人信息"` | 第一条无依据;后两条与付费套餐、与默认开启的云同步矛盾 |

**风险排序**:`aggregateRating` 最高(政策违规 + 失实),其次是隐私声明与实际云同步行为不符(可能构成对用户的不实陈述),再次是过期与失效链接。

**建议**:单独开一个 issue 处理,最小动作是删掉 `aggregateRating` 与过期的 `priceValidUntil`、修正 `sameAs`、把隐私与价格表述改成与现状一致。landing 侧的 `Seo.astro` 已按此原则实现(不含评分、不含价格),可作参照。

### 11.3 favicon 未达到原定 <5 KB（据实调整为 <20 KB）

原验收写的是"换 SVG,favicon < 5 KB"。核查后仓库内**没有品牌标的 SVG 源**——`apps/web/public/marks/*.svg` 是 AI 宠物形象(polaris),不是 Magic Resume 品牌标。

因此改为位图方案:512×512 / 141 KB → **128×128 / 15 KB**。该尺寸覆盖 favicon 与页面内 28×28 的 2× 渲染。若将来补上 SVG 源可再降到 1 KB 级,不阻塞本轮。

---

## 12. 追溯（PR / 测试）

- 待补
