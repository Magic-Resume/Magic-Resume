---
title: GEO 方案（让答案引擎能引用 Magic Resume）
type: spec
status: Draft
owner: kaihuang
created: 2026-08-05
updated: 2026-08-05
summary: 面向生成式引擎（豆包 / ChatGPT / Perplexity / AI 概览）的可引用性建设——先清掉正在扣信任分的不实声明，统一实体定义，再补结构化内容与站外痕迹。
scope: [apps/landing, apps/web, apps/docs, README]
repos: [Magic-Resume]
related: [../landing-optimization/spec.md]
---

# GEO 方案

> 一句话：SEO 争的是搜索结果里的排名，GEO 争的是 AI 回答里被点名。我们现在的问题不是没做优化，而是**正在因为几个可被当场证伪的数字扣信任分**。

## 实施状态（2026-08-05）

| 批次 | 状态 |
|---|---|
| **G0** 止血：清不实声明 + 统一实体定义 + 修 canonical | ✅ 已完成 |
| **G1** 站内结构化：llms.txt + 对比表 + 量化 + schema | ✅ 已完成 |
| **G2** docs 83 篇改造 | ⏸ 单独立项 |
| **G3** 站外痕迹 | ⏸ 非代码工作 |
| **G4** 三步验证 | ⏸ 需你在各引擎实测 |

`tsc --noEmit` 与 landing `build` / `astro check` 均零错误。实施中另发现四项，见 §8。

---

## 1. 方法论来源

主要参考黄小木《GEO 从 0 到 1 小白完整教程》（X 原生长文，`x.com/i/article/2068611360217559040`，需登录）。正文已存档于 `.playwright-mcp/geo-article.md`。

它的框架，压成三行：

```
GEO = SEO（让 AI 搜得到你）+ RAG（让 AI 愿意引用你）
三层漏斗 = 能看见（可检索）→ 读得懂（结构化）→ 信得过（交叉验证）
高推荐率 = 权威渠道 + 结构化内容 + 数据背书
```

四个最易被引用的内容模板：**定义式**（抢"是什么"的解释权）、**要点式**（抢"有哪些"）、**结论式**（给模型锚点）、**表格对比式**（抢"哪个好"，作者称其为核武器）。

三条红线：隐藏文本堆词、**数据造假**、信息太少致幻觉。

> 附带观察：这篇讲 GEO 的文章本身发在 X 原生长文里，未登录不可读，爬虫与答案引擎大概率也抓不到。**内容放在哪里，比内容写得多好更决定它能否被引用**——这条对我们选择"把 GEO 主力放 docs 与 README 而非 landing"是直接支撑。

---

## 2. 现状审计（2026-08-05 实测）

### 2.1 技术地基：已具备

上一轮 landing 优化（`../landing-optimization/spec.md` P0-c）恰好覆盖了文章第 5 章的技术要求：

| 文章要求 | 状态 |
|---|---|
| 5.2 Schema 结构化数据 | ✅ landing 双语输出 FAQPage + SoftwareApplication |
| 5.3 robots.txt 给 AI 爬虫放行 | ✅ `User-agent: * / Allow: /` |
| 4.2 模板二「要点式」 | ✅ FAQ 已是问答结构且被 schema 标记 |
| 内容须为爬虫可读的 HTML | ✅ 全站 SSR |
| 5.4 llms.txt | ❌ 缺 |

### 2.2 实体定义：四个面四种说法

答案引擎靠交叉印证建立实体认知，说法不一致就建不起稳定实体。

| 来源 | 自述 |
|---|---|
| `apps/landing` i18n | **AI 简历工作台** — AI 就地提议修改，由你决定采纳 |
| `apps/web` metaConfig | **免费的 AI 智能简历制作器** — 精美模板、一键生成 |
| README | **AI 原生简历平台** — 还能让 AI 编程工具直接编辑 |
| `apps/web` StructuredData | **AI驱动的智能简历制作器** / **专业的AI简历制作平台**（同文件内两处又不一致） |

### 2.3 ⚠ 正在踩红线：不实声明清单

文章红线第 2 条：「数据造假……AI 全网交叉验证，比对不上就给你打低可信标签，**以后说真话也不引用**」。代价不是单条声明不被采信，而是**整个信源降权**。

对开源项目尤其致命：任何人点开 GitHub 就能验证，交叉验证成本几乎为零。

| 位置 | 声明 | 实际 | 可证伪性 |
|---|---|---|---|
| `metaConfig.ts:19` | `提供50+精美模板` | **19 套**（`packages/resume-schema` `templateIds` 已核实） | 极高，仓库可数 |
| `metaConfig.ts:19` | `已帮助10万+用户成功求职` | 量级存疑，**需业务方核对** | 高，外部可质疑 |
| `metaConfig.ts:10` | `免费的AI驱动智能简历制作器` | 与 Free/Pro 双档订阅矛盾 | 高，价格页可查 |
| `StructuredData.tsx:95-101` | `aggregateRating 4.8 / reviewCount 500` | **无评价体系，纯编造** | 极高，且违反 Google 结构化数据政策 |
| `StructuredData.tsx:88-94` | `price: "0"` / `priceValidUntil: "2025-12-31"` | 与订阅矛盾；日期已过期 | 高 |
| `StructuredData.tsx:39-43,62-65` | `sameAs` 指向 `github.com/magic-resume` 等 | 真实仓库是 `LinMoQC/Magic-Resume` | 极高，链接可点 |
| `StructuredData.tsx:131` | `准确率达到90%以上` | 无依据 | 中 |
| `StructuredData.tsx:139` | `所有简历数据采用本地存储，我们不会收集或存储您的个人信息` | 与默认开启的云同步矛盾 | **高，且属对用户的实质性陈述** |
| `metaConfig.ts:51-54` | `google: "your-google-verification-code"` | 占位符被发布到生产 | — |
| `metaConfig.ts:38` | `creator: '@MagicResume'` | handle 真实性存疑 | 高 |

**影响面被低估了**：`metaConfig.Landing` 被 spread 进 `app/layout.tsx` 的根 metadata，`StructuredData` 的 website / organization / product 三段也渲染在根 layout —— 即上述内容出现在 **`apps/web` 的每一个页面上**，不是只在首页。

### 2.4 另一处需修正：web 的 canonical 指向 landing

`metaConfig.ts:55-61` 声明 `canonical: 'https://magic-resume.cn'` 与 `languages: {zh-CN: .../zh, en-US: .../en}`。但 Astro 拆分后 apex 归 landing，web 在 `app.magic-resume.cn`。**web 的所有页面正在把 landing 声明为自己的规范地址**，等于主动放弃自身索引。

### 2.5 资产盘点

| 资产 | 规模 | GEO 价值 |
|---|---|---|
| GitHub 仓库（MIT 开源） | 有 star、有贡献者 | **最高**——第三方可验证、被 awesome 列表收录的天然载体 |
| `apps/docs/content` | **83 篇** md/mdx，中英双语 | **被严重低估**，是"教程页"的现成库存 |
| `apps/landing` | 9 个 section，文字稀疏 | 中——适合承载"定义式"与对比表，不适合长文 |
| `apps/web` | 应用本体 | 低——多数页面 `noindex` |

---

## 3. 唯一实体定义

按文章模板一：`[品牌] 是 [行业定位] + [核心差异化] + [成立时间/背书]`。

**短版（meta description / og:description 用）**

> 中文：Magic Resume 是开源的 AI 简历工作台：AI 就地提出修改建议，你逐条决定采纳或跳过。MIT 协议内核，19 套模板，六种工作模式，多设备云同步。

> English: Magic Resume is an open-source AI resume workbench: the AI proposes edits in place and you accept or skip each one. MIT-licensed core, 19 templates, six modes, cloud sync.

**长版（JSON-LD description / README 首段用）**：短版 + 枚举六种模式（创建、优化、分析、翻译、面试、导出）。

**必须一字不差出现的位置**（不一致即失效）：

1. `apps/landing/src/i18n/{en,zh}.json` → `meta.description`
2. `apps/web/src/lib/constants/metaConfig.ts` → `description` / `openGraph.description`
3. `apps/web/src/components/shared/StructuredData.tsx` → 各 `description`
4. `apps/landing/src/components/Seo.astro` → SoftwareApplication `description`（已自动取 `meta.description`，改 1 即可）
5. `README.md` / `README.zh-CN.md` 首段
6. GitHub 仓库 About 字段（**需你手动改，代码改不到**）

---

## 4. 分批

### G0 — 止血（最高优先级，不依赖任何决策）

1. 删除 / 修正 §2.3 全部不实声明
2. 统一 §3 实体定义到六处
3. 修正 §2.4 的 canonical 错指

**原则**：无法核实的数字**删除**，不替换成另一个猜测值。宁可少说，不可错说——这正是红线 2 的要求。

### G1 — 站内结构化

1. **llms.txt**（文章 5.4）：landing 生成，列出站点结构与核心页面
2. **对比表**（文章 4.2 模板四，"核武器"）：落在 **README**，不落 landing
   - 理由：README 是 OSS 项目权重最高且必被抓取的页面；markdown 表格原生可抽取；不破坏刚定稿的 landing 排版
   - 内容取**自部署 vs 云端**这一真实差异矩阵，不做竞品对比（对他人做断言风险高且难维护）
3. **量化数据**（文章 4.3）：把定性形容换成**真实**数字——19 套模板、6 种模式、MIT、中英双语、GitHub star（构建期实时取）
4. **Schema 补全**：`dateModified` / `softwareVersion` 新鲜度信号

### G2 — docs 改造（单独立项，不在本轮）

83 篇内容，按文章 5.5 两条低成本改法：

- **答案前置**：每页开头一段自足摘要（脱离上下文可被整段引用）
- **标题写成问句**：`editor` → 「Magic Resume 怎么编辑简历?」；`ai-interview` → 「AI 模拟面试怎么用?」
- 补 `Article` schema（`headline` / `datePublished` / `author`）

### G3 — 站外痕迹（非代码工作）

文章入场条件之二：「网上得有痕迹……你自己喊的全宇宙最好用只是广告噪音」。

- 进 `awesome-*` 列表（开源项目的标准动作）
- 知乎 / 掘金 / 少数派 / V2EX 的真实技术分享
- 中文答案引擎（豆包 / Kimi / 元宝）重度依赖微信搜一搜与知乎

**这块收益最高但不是写代码**，需要你或运营投入。

### G4 — 验证与监测（文章第 7 章）

三步测试法，**应在 G0 之前先跑一轮存基线**：

1. **查收录**：问「介绍一下 Magic Resume」——AI 说得对吗？
2. **查推荐**：问「推荐几款开源的 AI 简历工具」（不带品牌名）——回答里有我们吗？
3. **看引用源**：AI 的答案是从哪些页面引来的？

引擎我这边调不到，需你在豆包 / ChatGPT / Perplexity 上实测。热门赛道建议每周一测。

---

## 5. 需要你提供的输入

| # | 事项 | 阻塞什么 |
|---|---|---|
| 1 | 真实用户量级 | 「10万+」删掉后要不要换成真数字 |
| 2 | 真实社交 handle（X / 其它） | `sameAs` 与 `twitter.creator` 填什么 |
| 3 | Search Console / Bing 验证码 | 替换 `your-google-verification-code` 占位符 |
| 4 | GitHub 仓库 About 字段 | 代码改不到，需你在网页端改成 §3 定义 |
| 5 | G4 基线实测 | 效果无法评估 |

---

## 6. 验收

- [ ] 全仓搜不到 `aggregateRating`、`50+`、`10万+`、`your-google-verification-code`
- [ ] §3 的定义在 5 处代码位置一字不差（第 6 处 GitHub About 需人工）
- [ ] `apps/web` 的 canonical 不再指向 landing 域名
- [ ] landing `/llms.txt` 可访问且内容正确
- [ ] README 含定义式首段 + 自部署/云端对比表
- [ ] 所有留下的数字均可在仓库内核实（19 套模板、6 种模式、MIT）
- [ ] G4 三步测试：G0 前存基线，G0+G1 上线 7 天后复测

---

## 8. 实施中的新发现

### 8.1 「模板数量」在三处给了三个不同的数字

审计时只发现了 web 的「50+」，实施中查 README 才发现第三个版本：

| 来源 | 声称 |
|---|---|
| `apps/web` metaConfig | 50+ |
| `README.md` / `README.zh-CN.md` | 12 |
| **实际**（`packages/resume-schema` `templateIds`） | **19** |

三个数字没有一个是对的。全部改为 19。

**根因是手写常量**。建议后续若要在文案里再引用模板数，从 `templateIds.length` 取值而非手写——这类数字只要能手写就一定会漂。同理已删掉 metaConfig 里注释掉的 `'Templates'` 草稿配置（内含「50+精美模板」）：注释掉的假数字迟早被人取消注释发出去。

### 8.2 README 与 landing 对「云同步默认开关」的表述互相矛盾

- README：「默认全部本地运行。**除非你主动开启云同步**，简历数据都只保存在你自己的浏览器」
- landing `sync.subtitle`：「**云端同步默认开启**：在工位改的每一个字，回家打开手机就在」

两句都出自我们自己，直接打架。答案引擎抓到会无所适从，用户看到会觉得被误导。

根因是二者描述的是不同部署形态（自部署 vs 云端），但都用了绝对语气。已改为**按形态限定**的表述，并借这个区分产出了 §4 G1 要求的对比表——矛盾点反而成了对比表最有价值的一行。

### 8.3 结构化数据引用了 6 张不存在的图片 + 1 个不存在的路由

`StructuredData.tsx` 的 `howto` / `article` 分支引用了 `/howto-guide.png`、`/step1-template.png` 等 6 张图，`apps/web/public` 里**一张都没有**；`website` 分支的 `SearchAction` 指向 `/search`，该路由不存在。均已删除或改指真实资产。

### 8.4 上一轮删掉 landing 的 preview.png，连带打断了 web 的 schema 引用

`StructuredData.tsx` 的 `screenshot` 指向 `https://magic-resume.cn/magic-resume-preview.png`——那是 landing 域名下的资产，而 landing 优化时该文件已被 `magic-resume-og.jpg` 取代。若不修，schema 会指向一个 404。

**教训**：跨 app 的资产引用（web 的 schema 指向 landing 域名下的文件）没有任何静态检查能发现。建议此类引用集中登记，或改由构建期校验。

---

## 9. 追溯（PR / 测试）

- 待补
