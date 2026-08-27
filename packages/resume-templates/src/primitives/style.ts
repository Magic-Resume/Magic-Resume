/**
 * 样式：允许自由组合，不允许自由创造属性。
 *
 * ## 为什么是「字典 + 引用数组」
 *
 * 节点写 `style: ["sectionHeading", { marginTop: 4 }]`。**两个后端都免费**：
 * HTML 得到一串 class；react-pdf 的 `style` 属性本来就接受数组，混合引用与内联覆盖
 * 是它的原生行为。这也正是 Figma（按 id 引用）与 OOXML（`pStyle` + 直接覆盖）的模型。
 *
 * 反面教材有生产实证：Builder.io 把样式内联在每个块上，结果内容条目撞到 ~1MB 上限
 * 保存失败，官方文档专门写了一节教人「把重复抽进 Symbol」。一棵树把同样 8 个属性
 * 在 30 个节点上重复，既费 token 又必然漂移。
 *
 * ## 为什么属性是白名单且数值被钳制
 *
 * 模板会由模型生成。白名单挡住「两个后端里只有一边支持」的属性（grid、box-shadow）；
 * 钳制挡住 `fontSize: 400` 这种结构合法、视觉灾难的值。Reactive Resume 在同一堵墙前
 * 得出了同样的结论，它的 Custom Styles 也是白名单 + 钳制。
 */

/** 引用一个具名样式，或直接内联一组属性。 */
export type StyleRef = string | Record<string, unknown>;

/** 解析后的样式。**只有两个后端都能实现的属性**。 */
export interface ResolvedStyle {
  // 盒
  flexDirection?: 'row' | 'column';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch' | 'baseline';
  justifyContent?:
    | 'flex-start'
    | 'center'
    | 'flex-end'
    | 'space-between'
    | 'space-around';
  flexWrap?: 'wrap' | 'nowrap';
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: number | string;
  gap?: number;
  width?: number | string;
  height?: number | string;
  maxWidth?: number | string;
  minWidth?: number | string;

  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  backgroundColor?: string;
  borderRadius?: number;
  opacity?: number;

  /**
   * 逐边边框。**这是最容易被漏掉、也最便宜的一组。**
   * 7 个既有组件把小节标题的横线画成标题元素的 `borderBottom`，8 个模板在用；
   * `red-accent` 的左侧强调条也是边框。没有它们，这些形态全部消失。
   */
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';

  // 文字
  color?: string;
  fontSize?: number;
  fontWeight?: 400 | 700;
  fontStyle?: 'normal' | 'italic';
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textDecoration?: 'none' | 'underline' | 'line-through';
}

/**
 * 字重只收 400 / 700。
 *
 * ## 实测的三条（与直觉不同，别照着猜）
 *
 * | 写了什么 | react-pdf 的实际行为 |
 * |---|---|
 * | 未注册的 `fontFamily` | **抛** `Font family not registered` |
 * | 未注册的 `fontStyle: 'italic'` | **抛** `Could not resolve font for …` |
 * | 未注册的 `fontWeight`（如 500） | **静默回落**到最近的已注册字重 |
 *
 * 所以白名单的理由**不是**「否则导出会炸」——那是前两条的行为。真正的理由是：
 * 我们的 CJK 字体只注册了 Regular(400) 与 Bold(700)，写 `fontWeight: 600` 时
 * 浏览器按 600 渲染（可变字体或 medium 字面），PDF 静默回落到 400 或 700——
 * **两边看起来不一样，却都不报错**。
 *
 * 而语义一致性测试**抓不到这一类**：两边 IR 里携带的都是 600，比对是相等的。
 * 白名单是这条漂移唯一的防线。
 *
 * 顺带纠正一个仓库里流传的说法：楷体把斜体变体指向同一个文件（`pdf/browser.tsx`），
 * 防的是 `fontStyle: 'italic'` 找不到面而抛，**与字重无关**。
 */
export const ALLOWED_FONT_WEIGHTS = new Set([400, 700]);

/** 数值钳制。结构合法 ≠ 视觉可用——`fontSize: 400` 两者都满足前者。 */
export const CLAMPS: Record<string, [number, number]> = {
  fontSize: [4, 96],
  lineHeight: [0.5, 4],
  letterSpacing: [-8, 32],
  opacity: [0, 1],
  borderRadius: [0, 999],
  gap: [0, 200],
  flexGrow: [0, 100],
  flexShrink: [0, 100],
  padding: [0, 400],
  paddingTop: [0, 400],
  paddingRight: [0, 400],
  paddingBottom: [0, 400],
  paddingLeft: [0, 400],
  margin: [-200, 400],
  marginTop: [-200, 400],
  marginRight: [-200, 400],
  marginBottom: [-200, 400],
  marginLeft: [-200, 400],
  borderTopWidth: [0, 24],
  borderRightWidth: [0, 24],
  borderBottomWidth: [0, 24],
  borderLeftWidth: [0, 24],
};

/** 属性白名单。JSON Schema 也读它——两份清单会漂，一份不会。 */
export const ALLOWED_STYLE_KEYS = [
  'flexDirection', 'alignItems', 'justifyContent', 'flexWrap', 'flexGrow',
  'flexShrink', 'flexBasis', 'gap', 'width', 'height', 'maxWidth', 'minWidth',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'backgroundColor', 'borderRadius', 'opacity',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderColor', 'borderStyle',
  'color', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
  'letterSpacing', 'textAlign', 'textTransform', 'textDecoration',
] as const;

const ALLOWED_KEYS = new Set<string>(ALLOWED_STYLE_KEYS);

/**
 * 长度属性。**IR 的长度单位统一是 CSS px。**
 *
 * 必须显式列出来，因为两个后端的原生单位不同：DOM 拿到数字补 `px`，
 * react-pdf 拿到数字当**点**用。同一个 `fontSize: 10`，PDF 里会大 33%——
 * 而且一致性测试比的是数值（10 === 10），**看不出单位差**。
 * 所以换算放在 PDF 后端边界上，这份清单是它的依据。
 *
 * 不在此列的：`lineHeight`（无单位倍数）、`opacity`、`flexGrow` / `flexShrink`、
 * 以及所有颜色与关键字。给它们乘 0.75 会直接改坏语义。
 */
export const LENGTH_KEYS = new Set<string>([
  'gap', 'width', 'height', 'maxWidth', 'minWidth', 'flexBasis',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'borderRadius', 'fontSize', 'letterSpacing',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
]);

/** CSS px → PDF 点。72dpi / 96dpi。 */
export const PX_TO_PT = 0.75;

/** 间距档位 → CSS px。枚举挡住「模型随手写个 37」。 */
export const SPACING_SCALE: Record<string, number> = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
};

/**
 * `fontStyle: 'italic'` 是**真会让导出抛异常**的那一个。
 *
 * 实测：字体族没有 italic 面时，react-pdf 抛 `Could not resolve font for …`，
 * 整份 PDF 渲不出来。与字重的静默回落完全不同——那个只是难看，这个是崩。
 *
 * 编译期没法知道运行时注册了哪些面，所以这里不能靠白名单挡。约束落在两处：
 *
 * 1. **注册端**：`pdf/browser.tsx` 给每个族都注册了 italic 变体，没有真斜体的
 *    （楷体）就指向同一个正体文件。新增字体族时必须照做。
 * 2. **自检端**：`overflow.ts` 真的渲染一遍，抛了就报 `ok:false`——
 *    在用户点导出**之前**发现。第 4 期的 AI 复刻闭环依赖这条。
 *
 * 之所以仍然放行 `fontStyle`：斜体是真实的排版需求，而上面两道防线都是有效的。
 * 把它从白名单里删掉是过度反应。
 */
const clamp = (value: number, [lo, hi]: [number, number]): number =>
  Math.min(hi, Math.max(lo, value));

/**
 * 把一个样式对象里不认识的属性剔掉、能钳的钳住。
 *
 * **不抛异常**：模板里一个坏属性不该让整份简历渲染不出来，丢掉它就好。
 */
export function sanitizeStyle(input: Record<string, unknown>): ResolvedStyle {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    let value = raw;
    if (key === 'fontWeight') {
      const n = Number(value);
      if (!ALLOWED_FONT_WEIGHTS.has(n)) continue;
      value = n;
    } else if (typeof value === 'number' && CLAMPS[key]) {
      value = clamp(value, CLAMPS[key]);
    }
    out[key] = value;
  }
  return out as ResolvedStyle;
}

/**
 * 解析 `style` 数组：按顺序合并，后面的覆盖前面的。
 *
 * 与 react-pdf 的数组语义、CSS 的层叠顺序一致——三处一致，作者不用记第四套规则。
 * 找不到的具名样式**静默跳过**：拼错一个名字不该让节点消失。
 */
export function resolveStyle(
  refs: StyleRef[] | undefined,
  dictionary: Record<string, Record<string, unknown>> | undefined,
): ResolvedStyle {
  if (!refs?.length) return {};
  const merged: Record<string, unknown> = {};
  for (const ref of refs) {
    const source = typeof ref === 'string' ? dictionary?.[ref] : ref;
    if (!source) continue;
    Object.assign(merged, source);
  }
  return sanitizeStyle(merged);
}
