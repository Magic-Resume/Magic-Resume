# Magic Resume Landing — 设计规范

> 适用范围:`apps/landing`(Astro 静态站,`/en`、`/zh`)。
> 不适用于 `apps/web`(产品内 UI 仍遵循 `.impeccable.md` 与 `docs/specs/light-theme/`)。
> 状态:**已实施**(2026-08-05)。§9 六档改造全部落地,`build` + `astro check` 零错误。
> 剩余待办只有人工视觉走查与 Lighthouse 实测。

---

## 0. 一句话意图

**深夜里的精密仪器。** 近黑底、纸白字、发丝级描边,唯一一处酸性柠檬黄用来指示"下一步点这里"。
页面本身不表演,表演的是嵌在框里的产品界面。

三条铁律,违反任何一条都算返工:

1. **颜色是稀缺资源** —— 全页只有 2 个实心彩色元素(§2.2 强调色预算表),其余一律灰阶。
2. **层次靠描边不靠阴影** —— 表面台阶(#08090a → #0f1011 → #161718)+ 1px 发丝边;不用投影把卡片"抬起来"。
3. **字重封顶 590** —— 没有粗体。层次靠字号、字距、明度差做,不靠加粗。

---

## 1. 双层配色架构 ★

这是本规范最重要的一条结构性决定,先读它,后面所有规则都建立在它之上。

页面被 `.linear-frame` 切成两个世界,**两层用不同的配色系统,边界就是这个框**:

| | **Chrome 层**(站点自身) | **Product-Sim 层**(框内产品仿真) |
|---|---|---|
| **目录** | `components/sections/`、`layouts/`、`components/*.astro`、`islands/Faq.tsx` | **`components/islands/`、`components/product-sim/`** |
| 范围 | Header / 标题 / 正文 / 按钮 / eyebrow / 分隔线 / Footer | 三个产品仿真岛 + 简历纸卡 |
| 底色 | Void `#08090a` | 产品自己的工作台色 |
| 强调色 | **Acid Lime `#e4f222`** | **保留 sky-400 `#38bdf8`** |
| 字体 | Inter Variable | 跟随产品(可用任意,以像真为准) |
| 圆角 | 只有 2 / 6 / 12 / pill | 不限,以像真为准 |
| 字号下限 | 12px | 无下限(视作截图) |
| 心智 | 这是营销页 | 这是一张会动的产品截图 |

**为什么这么切:**

- Linear 官网的做法就是这样——chrome 是单色 + 一个荧光强调色,而框里的产品截图保留 Linear 应用真实的紫/蓝/绿状态色。截图如果被刷成品牌色就不再是截图,而是插画,可信度归零。
- 它顺手解决了 landing 换成柠檬黄后最大的风险:**从 landing(黄)点进 /dashboard(蓝)的观感断裂**。访客在 landing 上已经透过三个产品框看了一路 sky 蓝的产品界面,进入应用时看到的是同一套蓝——断裂发生在"营销外壳"这一层,而营销外壳本来就该在进入应用时消失。
- 工程上它把改造面积从"全站 38+12 处 sky"压到"chrome 层 12 处",三个岛(1453 行 tsx)零改动。

**边界规则:** Chrome 层禁止出现 sky;Product-Sim 层禁止出现 acid lime。跨界即违规。

**边界必须是目录边界,不能只靠注释。** 实施时踩到过:简历纸卡原本内联在 `Sync.astro` 里,它合法地用着 `text-sky-700` 和 `font-semibold`,导致任何 chrome 层的 grep 检查都会被这两行绊倒——规则一旦"总是误报"就等于没有规则。现已抽成 `components/product-sim/ResumeCard.astro`。以后新增任何产品仿真元素,先建文件再写代码,不要内联进 section。

`islands/Faq.tsx` 是例外:它虽在 `islands/` 下,但渲染的是 FAQ 手风琴这种站点内容,不是产品界面,因此按 **Chrome 层**管。

---

## 2. 颜色

### 2.1 调色板

Chrome 层可用色的**全集**。表里没有的颜色,chrome 层不许出现。

| 名称 | 值 | Token | 用途 | 对 `#08090a` 对比度 |
|---|---|---|---|---|
| Void | `#08090a` | `--color-workbench` | 页面画布,全出血底 | — |
| Carbon | `#0f1011` | `--color-surface` | 卡片面、产品框底、nav 容器 | — |
| Obsidian | `#161718` | `--color-surface-2` | 更高一层的嵌套面 | — |
| Graphite | `#23252a` | `--color-hairline` | 发丝边、分隔线、ghost 描边 | — |
| Smoke | `#383b3f` | `--color-hairline-strong` | 高一档的分区分隔 | — |
| Ash | `#62666d` | `--color-faint` | 装饰性元数据 | **3.5:1 ⚠** |
| Fog | `#8a8f98` | `--color-muted` | 次要正文、占位、图标 | 6.1:1 ✓ |
| Mist | `#d0d6e0` | `--color-ink-soft` | 正文、按钮文字 | 13.7:1 ✓ |
| White | `#ffffff` | `--color-ink` | 标题、最高对比强调 | 19.9:1 ✓ |
| **Acid Lime** | `#e4f222` | `--color-accent` | **唯一强调色**,见 §2.2 | 16.2:1 ✓ |

对比度为实测值(WCAG 相对亮度公式)。

**⚠ Ash `#62666d` 只有 3.5:1,不达正文 AA(4.5:1)。** 它只允许出现在:①字号 ≥24px 的大字;②非文本装饰(分隔点、图标描边);③禁用态。当前 `Footer` / `Hero.trust` / `LabScene.modes.desc` 用 `text-faint` 承载 12–13px 正文——那是违规的,改造时统一提到 Fog(§9)。

**命名陷阱:** 仓库里 `--color-paper` 已经被"简历纸底"占用(`Sync.astro:63` 的白色简历卡),**不要**把 Linear 参考里的 `Paper`(=白色文字)映射成这个名字。白色文字用 `--color-ink`。

### 2.2 强调色预算表 ★

Acid lime 是闪光灯,不是涂料。全站配额:

| 位置 | 允许用量 | 形态 |
|---|---|---|
| Hero 主 CTA | 1 | 实心 lime 底 + `#08090a` 黑字 |
| CTA section 按钮 | 1 | 同上 |
| `:focus-visible` 焦点环 | 不限 | 2px lime 描边(可达性,不计入预算) |
| `::selection` 选中态 | 不限 | lime 30% 混色 |
| **其它任何位置** | **0** | — |

**每个视口内最多 1 个实心 lime 元素。** Hero 与 CTA section 相距整页,不会同屏。

Header 的"进入应用"用**白色 pill**(`#ffffff` 底 + 黑字)——它是系统里第二高对比元素,与 lime 形成两级 CTA 梯度,且滚动时始终吸顶,如果做成 lime 就会与 Hero 的 lime 同屏打架。

被这条预算砍掉的现有装饰(全部降级为中性,**不换成 lime**):

- `global.css:110` eyebrow 圆点 → `--color-muted`,去掉 `box-shadow` 光晕
- `Hero.astro:30` 标题强调词着色 → 见 §3.5
- `Hero.astro:65` trust 条勾选图标 → `--color-muted`
- `Workflow.astro:36`、`Sync.astro:32` 勾选圆片 → 底 `rgba(255,255,255,0.05)` + 图标 `--color-muted`
- `LabScene.astro:57` 六模式图标片 → 底 `rgba(255,255,255,0.05)` + 图标 `--color-ink-soft`,ring 用发丝色
- `OpenSource.astro:32` star 图标、`:30` hover 描边 → 中性,hover 时描边提亮到 Smoke
- `global.css:198`、`289` 的 sky 泛光 → 删除(纯白微光已经够)
- `hero-bloom` / CTA 底部泛光 → 见 §2.4

### 2.3 表面与描边(层次)

层次**只**由这两样产生,没有第三样:

```
表面台阶:  #08090a → #0f1011 → #161718 → #23252a
发丝描边:  inset 0 0 0 1px rgba(255,255,255,0.07)
```

**关于 "0.5px":** Linear 参考里写 0.5px,但其组件规格全是 1px——这是原文档自相矛盾处。本规范统一为 **1px + 用透明度控制视觉粗细**。理由:0.5px 在 1× 屏上会被舍入成 0 或 1,在 2× 屏上是半像素抗锯齿,跨设备不可预测;`rgba(255,255,255,0.06~0.08)` 的 1px 线在任何 DPR 下都稳定,视觉上同样是发丝。

三档描边:

| 档 | 值 | 用在哪 |
|---|---|---|
| 结构环 | `inset 0 0 0 1px rgba(255,255,255,0.07)` | 卡片、面板、产品框 |
| 分隔线 | `1px solid rgba(255,255,255,0.06)` | section 之间的 `border-t`、Footer 分栏线 |
| 强调分隔 | `1px solid #383b3f` | 需要明确切断视线时(慎用,全页 ≤2 处) |

**不要用投影把卡片从画布上抬起来。** 唯一允许的投影:①产品框的环境阴影(§5.6);②lime 按钮的内阴影堆叠(§5.1)。

### 2.4 渐变

**渐变只有一个合法用途:Hero / CTA 的大气泛光。** 按钮、卡片、文字上一律不许出现渐变。

泛光去彩色化后的写法:

```css
/* Hero 顶部:一束冷白微光,不带色相 */
.hero-bloom {
  background: radial-gradient(
    50% 42% at 50% 0%,
    color-mix(in srgb, #ffffff 6%, transparent),
    transparent 72%
  );
}
```

CTA section 底部同理(`55% 70% at 50% 100%`,白 5%)。

Linear 参考里那条 "hero gradient floor:#08090a → #d0d6e0" 是**给纯截图站用的地板光**,我们的 Hero 下方是一个自带 `.linear-frame` 环境阴影的交互岛,再叠一层亮地板会把框的下缘吃掉。**不采用。**

---

## 3. 排版

### 3.1 字族

| 角色 | 字族 | Token |
|---|---|---|
| 全站主字(拉丁) | **Inter Variable** | `--font-sans` |
| 中文回落 | 系统 CJK 栈 | (并入 `--font-sans`) |
| 等宽 | `ui-monospace` 系统栈 | `--font-mono` |

```css
--font-sans:
  "Inter Variable", ui-sans-serif, system-ui, -apple-system,
  "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC",
  sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

**Sora 退役。** 现在 `font-display` 用的 Sora 是几何无衬线,和"精密仪器"的调性不同源;Linear 的字形身份恰恰来自 Inter 的替代字形。改造时删掉 `--font-display` 与 `@fontsource-variable/sora`,`font-display` 类全部替换为默认字族(10 处)。

**必须开启 OpenType 特性**,这三个替代字形就是这套排版的身份:

```css
body {
  font-family: var(--font-sans);
  font-feature-settings: "cv01" on, "ss03" on, "zero" on;
}
```

**Berkeley Mono 不采用**(商业字体,需授权)。等宽在本站只用于 GitHub star 数与版本号两处,系统栈足够,且零字节。

依赖变更:`+ @fontsource-variable/inter`,`- @fontsource-variable/sora`。

### 3.2 唯一 Type Scale

原参考里"Type Scale 表"和"Type Scale Detail"两处互相冲突(同一角色给了不同字重与字距)。**以下表为唯一来源**,冲突时以此为准。

| 角色 | 字号 | 字重 | 行高 | 字距(拉丁) | 用在哪 |
|---|---|---|---|---|---|
| Display | 64px | 510 | 1.0 | -0.022em | Hero 标题(桌面) |
| Section 标题 | 40px | 510 | 1.05 | -0.022em | 各 section h2(桌面) |
| Subheading | 24px | 400 | 1.33 | -0.012em | 卡片标题、FAQ 问题 |
| Body-lg | 17px | 400 | 1.6 | -0.011em | Hero 副标题 |
| Body | 15px | 400 | 1.6 | -0.011em | section 说明文字、正文 |
| Caption | 13px | 400 | 1.4 | -0.010em | nav、trust 条、footer 链接、eyebrow |
| Label | 12px | 400 | 1.4 | 0 | badge、元数据 |

字重只有四档:**300 / 400 / 510 / 590**。禁止 600(`font-semibold`)与 700(`font-bold`)。

Tailwind 写法(在 `@theme` 里声明后可用 `font-w510` / `font-w590`):

```css
--font-weight-w510: 510;
--font-weight-w590: 590;
```

响应式:Display 与 Section 标题用 `clamp()`,移动端下限 Display 36px / Section 26px,保持同样字距比例。

### 3.3 中文专项规则 ★

Linear 是纯拉丁排版系统,它的字距和行高直接套到中文上是错的。本站 `/zh` 是主要流量,以下规则**优先级高于 §3.2**:

| 项 | 拉丁 | 中文 | 原因 |
|---|---|---|---|
| Display 字距 | -0.022em | **-0.01em** | 全角方块字本身就贴边,-0.022em(64px 下 ≈ -1.4px)会让笔画粘连 |
| Display 行高 | 1.0 | **1.18** | 中文没有小写字母的视觉留白,lh 1.0 会让上下行笔画咬合 |
| Section 标题行高 | 1.05 | **1.25** | 同上 |
| 正文行高 | 1.6 | **1.75** | 中文字符密度高,需要更多行间呼吸 |
| 字重 510 | 正常 | **降到 400** | 系统 CJK 字体没有 510 这一档,会被合成加粗成脏笔画 |

**实现方式很关键,别写进 `@layer base`。**

第一版把这些规则写成 `@layer base { :lang(zh) h1 { line-height: 1.2 } }`,结果是**完全不生效**——Hero 标题上带着 `leading-[1.06] tracking-[-0.025em]` 工具类,而 Tailwind 的 utilities layer 排在 base 之后,层叠顺序上必然赢。中文页会静默继承拉丁度量,而且看不出报错。

正确做法:把 type scale 做成**无 layer 的语义类**,拉丁值与中文覆盖写在同一块里(见 `global.css` 的 `.type-*`):

```css
.type-display {
  font-size: clamp(2.25rem, 6vw, 4rem);
  font-weight: 510;
  line-height: 1;
  letter-spacing: -0.022em;
}
:lang(zh) .type-display {
  font-weight: 400;
  line-height: 1.18;
  letter-spacing: -0.01em;
}
```

已提供 5 个:`.type-display`(Hero)、`.type-heading-lg`(收尾 CTA)、`.type-heading`(section h2)、`.type-body-lg`、`.type-body`。**section 标题不要再手写 `text-[clamp(...)] font-... tracking-...` 工具类簇**,那会重新打开中文漂移的口子。

注意 `:lang(zh)` 匹配的是 `<html lang="zh-CN">`——CSS 语言选择器按语言区间匹配,`zh` 命中 `zh-CN`,不需要写成 `:lang(zh-CN)`。

另外两条已在 `global.css:65-81` 实现,保留:`h1,h2,h3 { text-wrap: balance }` 与 `p { text-wrap: pretty }`——中文标题折行不均的问题比英文严重得多。

**中英混排:** 中文句子里嵌英文单词(如 "AI 优化"、"GitHub")时不加人工空格,靠 `text-spacing-trim`/字体自身处理;文案里也不要手写全角空格。

### 3.4 禁止项

- 不用 700+ 字重(现有 41 处违规,见 §9)
- 不给文字加渐变、加描边、加投影
- 不用彩色正文——所有正文落在 White / Mist / Fog 三级灰里
- 等宽字体不用于标题和营销文案,只用于 star 数、版本号

### 3.5 标题里的"强调词"怎么办

`Hero.astro:15-18` 有一套把标题切成三段、给中间段着色的机制(`titleAccent`)。着色违反 §2.2 预算,但**机制保留**,改成无彩色强调:

```
强调段 → #ffffff (White)
其余段 → #d0d6e0 (Mist)
```

明度差本身就是强调。i18n 文案不需要改。

---

## 4. 空间与形状

### 4.1 圆角:只有四个

当前代码里有 **11 种**圆角(2/3/4/5/8/11/12/14/16/32/48px)。收敛到:

| Token | 值 | Tailwind 类 | 用在哪 |
|---|---|---|---|
| `--radius-xs` | 2px | `rounded-xs` | 微元素、focus ring 圆角 |
| `--radius-md` | 6px | `rounded-md` | 按钮、输入框、badge、小图标片 |
| `--radius-xl` | 12px | `rounded-xl` | 卡片、面板、产品框 |
| — | pill | `rounded-full` | 胶囊按钮、圆点、头像 |

**执行机制:** 在 `@theme` 里先清空整个 namespace,只留这三个:

```css
@theme {
  --radius-*: initial;
  --radius-xs: 2px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-full: 9999px;
}
```

这样 `rounded-sm` / `rounded-lg` / `rounded-2xl` **不再生成任何 CSS**,违规处会直接变成直角,肉眼可见。(Tailwind v4 对未知 utility 是静默跳过,不报错,所以这是视觉暴露而非构建门禁。)

任意值圆角(`rounded-[11px]` 之流)绕得过 theme,靠 CI grep 兜底:

```bash
# chrome 层全量违规检查。islands/ 与 product-sim/ 属 Product-Sim 层,不在检查范围内;
# islands/Faq.tsx 渲染站点内容而非产品界面,单独纳入检查。
grep -rnE 'font-(bold|semibold|medium|display)\b|text-faint|bg-faint|rounded-(sm|lg|2xl)\b|rounded-\[|sky-' \
  src/components/sections src/layouts src/components/*.astro src/components/islands/Faq.tsx \
  && { echo "chrome 层存在违规"; exit 1; }
```

这条命令目前是 **PASS**(零命中)。它能成立的前提是分层已经落到目录上——见 §1 末尾。

**12px 是卡片圆角上限。** 现有 `.linear-frame` 的 14px、`.bento` 的 14px、`Sync` 光晕的 3rem 全部下调。

### 4.2 间距

基准 4px,阶梯 `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`。

| 场景 | 值 | 现状 |
|---|---|---|
| 元素间距 | 8px | ✓ |
| 卡片内边距 | 24px | ✓ |
| Section 垂直间距 | 96px(md 以上 128px) | ✓ `py-24 md:py-32` |
| 内容容器最大宽 | **1120px** | ✓ 保持 |
| 页面左右留白 | 20px(md 24px) | ✓ `px-5 md:px-6` |

内容容器我们用 1120px,比 Linear 参考的 1200px 窄——这是既有的、一致的选择,不改。Hero 的外层 `max-w-[1400px]` 与产品框的 `max-w-[1280px]` 是刻意让产品框略微溢出内容栏的设计,保留。

### 4.3 阴影

只有三条合法阴影,其余场合一律用描边:

```css
--shadow-hairline: inset 0 0 0 1px rgb(255 255 255 / 0.07);
--shadow-frame:
  inset 0 1px 0 rgb(255 255 255 / 0.10),
  0 0 0 1px rgb(255 255 255 / 0.07),
  0 28px 90px -42px rgb(0 0 0 / 0.95);
--shadow-accent:
  inset 0 5px 2px rgb(0 0 0 / 0.01),
  inset 0 3px 2px rgb(0 0 0 / 0.04),
  inset 0 1px 1px rgb(0 0 0 / 0.07);
```

`--shadow-accent` 只给 lime 按钮——这是全系统唯一一处给 chrome 元素上真实阴影的地方。

---

## 5. 组件规格

### 5.1 主 CTA(Acid Lime)

```
背景  #e4f222
文字  #08090a,15px / 510 / -0.011em
圆角  6px
内距  10px 16px(Hero 与 CTA section 用 12px 24px)
阴影  --shadow-accent
hover 亮度 106%(不改色相,不加位移)
```

全页 2 个。图标(箭头)16px,与文字 8px 间距,hover 时 `translate-x-0.5`。

### 5.2 白 Pill(Nav CTA)

```
背景  #ffffff
文字  #08090a,13px / 510
圆角  9999px
内距  8px 16px
hover opacity 0.85
```

只在 Header 出现。

### 5.3 Ghost 按钮

```
背景  透明
描边  1px rgba(255,255,255,0.07)
文字  #d0d6e0,14px / 400
圆角  6px
内距  8px 12px
hover 文字 → #ffffff,描边 → #383b3f
```

Hero 次 CTA(GitHub)、OpenSource 的 star 按钮用它。

### 5.4 Nav 文字链接

```
背景  无
文字  #d0d6e0,13px / 400
内距  8px 12px
hover 文字 → #ffffff(不加下划线,不加背景)
```

### 5.5 Badge

```
背景  rgba(255,255,255,0.05)
文字  #8a8f98,12px / 400
圆角  6px
内距  2px 6px
```

star 计数用它 + `font-mono tabular-nums`。

### 5.6 产品框(`.linear-frame`)

Chrome 层与 Product-Sim 层的**唯一边界**,也是全站视觉重心。

```
圆角  12px(从 14px 下调)
背景  linear-gradient(180deg, rgba(255,255,255,0.012), rgba(0,0,0,0.07))
阴影  --shadow-frame
外发光  ::after 的 radial 泛光去掉 sky 分支,只留白 7%
内容  overflow:hidden,直接贴边,无 padding
```

现有 `global.css:118-207` 的实现(顶部高光线 + 发丝环 + 分层深度)是对的,只需:①三处 `border-radius:14px` → 12px;②`::after` 里的 sky 泛光改成白;③删掉冗余的 `.linear-frame` 裸规则(`:118-121` 的 `position`/`border-radius` 被 `:140-160` 完全覆盖)。注意 `:122-137` 的 `.linear-frame > :first-child` 是**活规则**(负责内容裁切与内边高光),不要连带删掉。

### 5.7 Eyebrow

```
字号  13px / 500 → 改 400
字距  0.02em(唯一允许正字距的地方)
颜色  #8a8f98
圆点  6px,#8a8f98,无光晕
```

### 5.8 Bento 卡片

```
背景  #0f1011
圆角  12px(从 14px 下调)
描边  inset 0 0 0 1px rgba(255,255,255,0.06) + inset 0 1px 0 rgba(255,255,255,0.05)
hover 描边提亮到 0.12;去掉 sky 泛光层(::after 整个删除)
```

---

## 6. Section 蓝图

页面顺序(`Home.astro:24-36`):Header → Hero → LabScene → Workflow → Sync → OpenSource → FAQ → CTA → Footer。

节奏原则:**每屏一个焦点。** 不用三栏卡片网格,不用瀑布流。文左图右与全宽产品带交替。

---

### 6.1 Header — `sections/Header.astro`

| | |
|---|---|
| 结构 | 吸顶,高 56px,`max-w-1120`,左 logo / 中 nav / 右操作区 |
| 底 | `#08090a/75` + `backdrop-blur-xl`,底部 1px 发丝线 |
| Logo | 图标 28px + 文字 "Magic Resume" 14px / 510 / White |
| Nav | 5 项,13px / 400 / Mist,间距 24px,hover → White |
| 右区 | GitHub star(ghost,mono 数字)· 语言切换 · **白 pill "进入应用"** |
| Accent | 0 |
| 验收 | 滚动时不变高、不换色;lime 一处不得出现 |

改动:`:31` 去掉 `font-display`;`:58` 的 `bg-ink` 方形按钮 → 白 pill(`rounded-full`);字重 `font-semibold` → `font-w510`。

---

### 6.2 Hero — `sections/Hero.astro`

| | |
|---|---|
| 结构 | 居中单栏(`max-w-3xl`)+ 下方全宽产品框 |
| 上边距 | `pt-40 md:pt-52 lg:pt-56`(保持) |
| 标题 | Display 64px / 510 / lh 1.0 / -0.022em;强调段 White,其余 Mist;中文走 §3.3 |
| 副标题 | 17px / 400 / Fog,`max-w-xl`,上距 24px |
| CTA | **lime 主按钮** + ghost GitHub 按钮,间距 12px,上距 32px |
| Trust 条 | 13px / Fog(从 Ash 提上来),勾选图标中性,竖线分隔用发丝色 |
| 产品框 | `EditorMockup`,`client:load`,上距 64px,`max-w-1280` |
| 背景 | `.hero-bloom` 冷白泛光(去 sky) |
| Accent | 1(主 CTA) |
| 验收 | 首屏除主 CTA 外无任何彩色;中文标题不粘连 |

---

### 6.3 LabScene — `sections/LabScene.astro`

| | |
|---|---|
| 结构 | 左对齐标题块(`max-w-2xl`)→ 全宽产品框 → 六模式条 |
| 标题块 | eyebrow + h2 40px/510 + 15px/Fog 说明 |
| 产品框 | `AiLabScene`,`client:visible`,上距 48px |
| 六模式条 | `grid-cols-2 sm:3 lg:6`,图标片 28px 中性方片,标题 13px/510/White,描述 12px/Fog |
| Accent | 0 |
| 验收 | 六个图标片全灰;描述文字对比度 ≥4.5:1 |

---

### 6.4 Workflow — `sections/Workflow.astro`

| | |
|---|---|
| 结构 | 同 6.3(标题块 → 产品框 → 要点条) |
| 分隔 | 顶部 1px 发丝线 |
| 产品框 | `ProposalStream`,`client:visible` |
| 要点条 | 横向 flex,勾选圆片中性,14px / Mist |
| Accent | 0 |

---

### 6.5 Sync — `sections/Sync.astro`

唯一的两栏 section(`lg:grid-cols-2`),也是唯一有自绘示意图的 section。

| | |
|---|---|
| 左栏 | eyebrow + h2 + 15px 说明 + 4 条要点列表(勾选圆片中性) |
| 右栏 | 同步星座图:简历纸卡 → 三条流动虚线 → 三个设备卡 |
| 简历纸卡 | **保留 `--color-paper` 暖白 + 红删绿增体系**——它代表的是简历文档本身,属 Product-Sim 层 |
| 流动线 | `stroke` 从 sky 改为 `rgba(255,255,255,0.18)`;虚线流动动画保留 |
| 设备卡 | Carbon 底 + 发丝环;同步脉冲点从 sky 改为 **White**,亮起时加白色光晕 |
| 光晕 | `:45` 的 `bg-sky-500/[0.06]` → `bg-white/[0.04]` |
| Accent | 0 |
| 验收 | `prefers-reduced-motion` 下三组动画全停(`:145-152` 已实现,保留) |

> 判断依据:简历纸卡是"产品产物"(Product-Sim),保留原色;连线与设备卡是"示意图"(Chrome),去色。

---

### 6.6 OpenSource — `sections/OpenSource.astro`

| | |
|---|---|
| 结构 | `lg:grid-cols-[1fr_auto]`,左文案 / 右巨大 star 数,底部贡献者条 |
| star 数 | 64px / 510 / White / `tabular-nums`(去 `font-display`) |
| star 按钮 | ghost,图标中性,计数用 §5.5 badge |
| 贡献者 | 顶部发丝线 + 13px/Fog 标签 + contrib.rocks 图 |
| Accent | 0 |
| 验收 | hover 时只有描边提亮,不出现彩色 |

---

### 6.7 FAQ — `sections/FaqSection.astro`

| | |
|---|---|
| 结构 | `lg:grid-cols-[4fr_7fr]`,左标题 / 右手风琴 |
| 条目 | 问题 17px / 400 / White,答案 15px / Fog;条目间 1px 发丝线 |
| 展开图标 | `+` 旋转 45° 成 `×`,颜色 Fog → White(去 sky) |
| Accent | 0 |
| 验收 | 手风琴按钮有 `aria-expanded`;键盘可达 |

---

### 6.8 CTA — `sections/CallToAction.astro`

| | |
|---|---|
| 结构 | 居中单栏 `max-w-2xl`,`py-28 md:py-36` |
| 标题 | 48px / 510 / White / -0.022em |
| 副标题 | 16px / Fog |
| 按钮 | **lime 主按钮**,`px-24 py-12`,15px / 510 |
| 注脚 | 13px / Fog |
| 背景 | 底部冷白泛光(去 sky) |
| Accent | 1 |

---

### 6.9 Footer — `sections/Footer.astro`

| | |
|---|---|
| 结构 | 顶部发丝线;左品牌块 / 右两栏链接;底部版权行 |
| 品牌 | logo 28px + 14px/510/White + 13px/Fog 一句话 |
| 链接 | 13px / Fog,hover → White |
| 版权 | 12px / Fog |
| Accent | 0 |

---

## 7. 动效

| 项 | 规则 |
|---|---|
| 属性 | 只动 `transform` 与 `opacity`。不动 `width`/`height`/`top`/颜色以外的布局属性 |
| 缓动 | `cubic-bezier(0.22, 1, 0.36, 1)`(指数式减速),**不弹跳、不 elastic** |
| 时长 | 微交互 150–250ms;进场 650ms |
| 位移 | 进场 `translateY(18px)`,不用缩放、不用旋转 |
| 编排 | `--reveal-delay` 每级 70ms,同一 section 内最多 4 级 |
| 循环动效 | 只允许出现在 Product-Sim 层(同步脉冲、提案流)。Chrome 层不许有常驻循环动画 |
| 降级 | `prefers-reduced-motion: reduce` 下全部关闭;`html:not(.js)` 下 reveal 内容必须可见 |

以上在 `global.css:312-337` + `Landing.astro:52-83` 已正确实现,**不要动**。

---

## 8. 可达性

- **对比度**:见 §2.1 实测表。正文只能用 White / Mist / Fog;Ash 仅限 ≥24px 或非文本。
- **焦点环**:`2px solid #e4f222` + `outline-offset: 2px`,圆角 2px。lime 对底 16.2:1,是全站最醒目的焦点提示——这也是 lime 值得留在系统里的功能性理由。
- **产品仿真岛**:岛内有大量 6–11px 文本(模拟真实产品在缩放下的样子)。

  规范初稿写的是"纯展示岛整块 `aria-hidden` + `sr-only` 描述"——**实施时发现这条对本站三个岛全都不成立**:`EditorMockup`、`AiLabScene`、`ProposalStream` 各有 5 / 5 / 2 个真实 `<button>`,`aria-hidden` 包含可聚焦元素本身就是违规。核查后现状是合格的:12 个按钮全部具备可访问名称(可见文字或 `aria-label`),且都在 tab 序列内、键盘可操作。

  因此**不加 `aria-hidden`,也不加 `sr-only` 重复描述**——每个产品框正上方就是该 section 的 h2 + 说明段,屏幕阅读器已经拿到了语境,再补一段 sr-only 只是噪音。

  **已知偏离(接受):** 岛内控件点击区约 14–18px,低于 WCAG 2.2 SC 2.5.8 的 24×24px。这些控件是按产品真实比例缩放的演示,放大即失真,适用该条款的 "essential" 例外;演示本身是补充内容,不操作它不影响理解页面。若将来这些演示承担真实转化职责(比如"在这里试一下"),此例外不再成立,必须放大到 24px。
- **语言**:`<html lang>` 已按 locale 正确输出(`Landing.astro:16`)。§3.3 的中文规则依赖 `:lang(zh)`,不要改成 class 判断。
- **动效**:见 §7 降级。

---

## 9. 改造清单(已完成)

六档已全部实施。以下保留为变更记录与回归参照。

### 档 1 — Token 层(改 `global.css` 一个文件,全站生效)

| 项 | 现状 | 目标 |
|---|---|---|
| `@theme` 颜色 | OKLCH 微染 sky 的中性色 | §2.1 的十档 hex |
| 强调色 | `sky-400` 散落引用 | 新增 `--color-accent: #e4f222` |
| 字族 | Sora + 系统栈 | Inter Variable + 系统 CJK 栈 |
| OpenType | 无 | `"cv01" on, "ss03" on, "zero" on` |
| 圆角 | 未定义,吃 Tailwind 默认 | `--radius-*: initial` + xs/md/xl 三档 |
| `::selection` `:66` | sky 混色 | lime 混色 |
| `:focus-visible` `:70` | sky 描边 | lime 描边 |
| `.eyebrow` `:96-112` | 500 字重 + sky 发光点 | 400 + Fog 实心点 |
| `.linear-frame` `:118-207` | 两段重复定义,14px,sky 泛光 | 删死代码,12px,白泛光 |
| `.bento` `:271-301` | 14px,sky hover 泛光 | 12px,删 `::after` |
| `.hero-bloom` `:304-310` | sky-500 13% | 白 6% |
| `--color-paper` 系 | 保留 | **保留**(Product-Sim) |

### 档 2 — Chrome 层去色(12 处)

`Hero.astro:30,65` · `Header.astro:58` · `LabScene.astro:57` · `Workflow.astro:36` · `Sync.astro:32,45,62,107,138,142` · `OpenSource.astro:30,32` · `CallToAction.astro:16` · `Faq.tsx:34`

每处按 §2.2 的降级表处理。**三个岛内部的 38 处 sky 全部不动。**

### 档 3 — 字重合规(41 处)

- `font-bold`(700)×7 → **全部 7 处都在岛内**(`AiLabScene:88,105,112`、`EditorMockup:179,194,335,352`),属 Product-Sim 层。若真实产品该处就是粗体则豁免保留,逐处对照产品截图判断,chrome 层无需改动。
- `font-semibold`(600)×34 → chrome 层的全部改 `font-w510`;岛内同上逐处判断。

### 档 4 — 圆角收敛

Chrome 层:`rounded-lg`×4 → `rounded-md`;`rounded-2xl`×1、`rounded-[3rem]`×1 → `rounded-xl`。CSS 里 `border-radius:14px`×3 → 12px,`32px` → 24px。

**岛内做了一次计划外的机械改名。** `--radius-*: initial` 会把 `rounded-sm`/`-lg`/`-2xl` 一并清掉,而岛内正用着这些类(6 + 9 + 0 处),不处理就会静默变直角——这是初稿"不改岛内部实现"没算到的连带影响。处理办法是换成**等值任意值**,计算值逐像素相同、视觉零变化:

| 原类 | Tailwind v4 值 | 换成 |
|---|---|---|
| `rounded-sm` | 4px | `rounded-[4px]` |
| `rounded-lg` | 8px | `rounded-[8px]` |
| 裸 `rounded` | 4px | `rounded-[4px]` |

岛内原有的 `rounded-[5px]`/`[11px]`/`[3px]` 不动。改完岛内只剩 `rounded-full` / `rounded-md` / `rounded-xl` + 任意值,全部不受 namespace 清空影响。

> 顺带一个工具坑:macOS 自带的 BSD `sed` 不支持 `\b` 词边界,`sed 's/\brounded-lg\b/.../'` 会**静默空跑不报错**。批量改类名用 `perl -i -pe`。

### 档 5 — 排版与 CJK

- 删 `font-display` 类(10 处)与 Sora 依赖
- 建立 §3.2 的 type scale,替换散落的 `text-[Npx]`(chrome 层约 30 处)
- 落地 §3.3 的 `:lang(zh)` 规则块
- `Landing.astro:40` `theme-color` `#0a0b0c` → `#08090a`

### 档 6 — 可达性

- `text-faint` 承载的 12–13px 正文全部提到 `text-muted`(chrome 层已无 `text-faint`)
- 岛内 `aria-hidden` 经核查**不应添加**,理由与已知偏离见 §8

### 顺带修的

- `apps/landing` 的 `lint` 脚本(`astro check`)缺 `@astrojs/check` 依赖,一跑就弹交互式安装提示——等于这个 workspace 的 lint 从来没通过过。已补进 devDependencies,现在 `pnpm --filter @magic-resume/landing lint` 可直接运行(27 文件 0 error 0 warning,1 个既有 hint:`consts.ts:4` 的 `PUBLIC_APP_ORIGIN` 已废弃)。

### 不做的事

- 不改 i18n 文案结构(`titleAccent` 机制保留)
- 不改 Astro 路由、`ClientRouter`、reveal 脚本
- 不改 `dashboardLink()` 的 UTM 归因逻辑
- 不改产品仿真岛的**设计与行为**(圆角类名的等值改写是 token 变更的连带,不属此列,见档 4)

---

## 10. 验收 Checklist

结构性(已用 §4.1 的 grep 验证):

- [x] chrome 层零 `sky-*` 引用
- [x] Product-Sim 层零 `#e4f222` 引用 —— 注意 `EditorMockup` 里的 `accent` 变量指的是**简历模板配色**(产品功能),与 `--color-accent` 同名不同物,grep 时别误判
- [x] 实心 lime 元素恰好 2 个(`Hero.astro:42`、`CallToAction.astro:29`),分处首尾两屏,不同屏
- [x] chrome 层零 `font-bold` / `font-semibold` / `font-medium`
- [x] chrome 层零任意值圆角;构建产物中 `.rounded-sm` / `-lg` / `-2xl` 已不生成

排版:

- [x] Inter Variable 已自托管(7 个 woff2 子集),`cv01`/`ss03`/`zero` 出现在构建 CSS 中
- [x] `:lang(zh)` 的 5 条 type scale 覆盖在压缩后完整保留(压掉的话英文页会吃中文度量,是静默故障)
- [ ] `/zh` 下 Hero 标题笔画不粘连 —— **人工**
- [ ] `/zh` 与 `/en` 标题在 375 / 768 / 1440 三个断点不出现孤字成行 —— **人工**

可达性:

- [x] 12 个岛内控件全部具备可访问名称,键盘可达(见 §8)
- [x] chrome 层已无 `text-faint`,正文对比度 ≥6.1:1
- [x] `prefers-reduced-motion` 与 `html:not(.js)` 兜底完好
- [ ] 键盘 Tab 走完全页,焦点环处处可见(lime 2px)—— **人工**

性能与 SEO:

- [ ] Lighthouse Performance ≥95、Accessibility 100(移动端)
- [ ] 首屏 CLS = 0(字体切换不跳版,产品框有固定高度)
- [ ] `/en`、`/zh` 的 canonical / hreflang / OG 正常

视觉走查(人工,`pnpm --filter @magic-resume/landing dev` → :3002):

- [ ] 全页滚一遍,除两个 CTA 外看不到第二种颜色
- [ ] 产品框内的界面看起来像真实产品截图,不像插画
- [ ] 从 Hero CTA 点进 /dashboard,配色过渡不突兀

---

## 附:`@theme` 粘贴块

替换 `src/styles/global.css` 的 `@theme` 段。

```css
@import "tailwindcss";
@import "@fontsource-variable/inter";

@theme {
  /* ── 字族 ───────────────────────────────────────────── */
  --font-sans:
    "Inter Variable", ui-sans-serif, system-ui, -apple-system,
    "PingFang SC", "Microsoft YaHei", "Source Han Sans SC",
    "Noto Sans CJK SC", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --font-weight-w510: 510;
  --font-weight-w590: 590;

  /* ── Chrome 层:表面 ────────────────────────────────── */
  --color-workbench: #08090a;      /* Void   — 画布 */
  --color-surface: #0f1011;        /* Carbon — 卡片面 */
  --color-surface-2: #161718;      /* Obsidian — 嵌套面 */
  --color-hairline: #23252a;       /* Graphite — 发丝边 */
  --color-hairline-strong: #383b3f;/* Smoke — 强调分隔 */

  /* ── Chrome 层:文字(对比度见 §2.1) ─────────────────── */
  --color-ink: #ffffff;            /* 19.9:1 — 标题 */
  --color-ink-soft: #d0d6e0;       /* 13.7:1 — 正文 */
  --color-muted: #8a8f98;          /*  6.1:1 — 次要 */
  --color-faint: #62666d;          /*  3.5:1 — 仅 ≥24px / 非文本 */

  /* ── 唯一强调色(预算见 §2.2) ─────────────────────────── */
  --color-accent: #e4f222;

  /* ── Product-Sim 层:简历纸(勿改,勿改名) ─────────────── */
  --color-paper: oklch(0.975 0.003 95);
  --color-paper-ink: oklch(0.28 0.01 260);
  --color-paper-muted: oklch(0.62 0.01 260);
  --color-del: #dc2626;
  --color-add: #15803d;

  /* ── 圆角:清空默认,只留四档 ───────────────────────── */
  --radius-*: initial;
  --radius-xs: 2px;
  --radius-md: 6px;
  --radius-xl: 12px;
  --radius-full: 9999px;  /* 保险:确保清空 namespace 后 rounded-full 仍可用 */
}

:root {
  color-scheme: dark;
}

body {
  background-color: var(--color-workbench);
  color: var(--color-ink-soft);
  font-family: var(--font-sans);
  font-feature-settings: "cv01" on, "ss03" on, "zero" on;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}

/* 中文排版覆盖 —— 优先级高于通用 type scale,理由见 §3.3 */
:lang(zh) h1,
:lang(zh) h2 {
  font-weight: 400;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
:lang(zh) p {
  line-height: 1.75;
}
```

---

## 决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 强调色 | Acid Lime `#e4f222` | 用户选定;landing 走独立营销品牌 |
| D2 | landing↔app 观感断裂 | 双层配色(§1) | 产品仿真层保留 sky,断裂只发生在营销外壳 |
| D3 | 文档形态 | 可执行落地规范 | 含 section 蓝图 + 差异清单 + 验收 |
| D4 | 主字族 | Inter Variable,Sora 退役 | cv01/ss03/zero 是这套排版的身份 |
| D5 | 等宽字 | `ui-monospace` 系统栈 | Berkeley Mono 需商业授权;本站仅两处用到 |
| D6 | 发丝边粗细 | 1px + 透明度 | 0.5px 跨 DPR 不可预测(原参考自相矛盾) |
| D7 | 圆角词汇 | 2 / 6 / 12 / pill | 原参考 token 与 Don'ts 冲突,取 Don'ts |
| D8 | Hero 地板渐变 | 不采用 | 会吃掉产品框的下缘阴影 |
| D9 | 内容容器宽 | 1120px(非 1200) | 沿用既有值,避免无谓迁移 |
| D10 | 标题强调词 | 无彩色,靠 White/Mist 明度差 | 正文与标题不着色是本系统底线 |
| D11 | 分层边界 | 落到**目录**(`islands/` + `product-sim/`) | 仅靠注释标注时,CI grep 会被合法例外绊倒而永远误报 |
| D12 | type scale 实现 | 无 layer 的 `.type-*` 语义类 | 写进 `@layer base` 会被 `leading-[]`/`tracking-[]` 工具类击穿,中文规则静默失效 |
| D13 | 岛内控件点击区 | 维持 14–18px,记为已知偏离 | 按产品真实比例缩放的演示,放大即失真;适用 WCAG 2.2 SC 2.5.8 "essential" 例外 |
