export const PDF_CJK_SANS_FAMILY = 'Source Han Sans SC';
export const PDF_CJK_SERIF_FAMILY = 'Source Han Serif SC';
// 楷体:霞鹜文楷 LXGW WenKai(SIL OFL)。源为 TrueType(glyf),须先 CFF 化再子集
// 才能被 react-pdf(fontkit@2.0.4)正确嵌入 —— glyf 子集路径对复杂字有 bug,
// CFF 走另一条正常的 CFFSubset。详见 docs/specs/kaiti-pdf-fontkit/。
export const PDF_CJK_KAI_FAMILY = 'LXGW WenKai';

// Full (non-subset) families, registered on demand when a resume contains CJK
// ideographs outside the subset (rare names). Distinct family names because
// @react-pdf/font resolves a family to its first-registered source and offers no
// way to replace one — so the full font must live under its own name and the
// document must reference it. See pdf/browser.tsx.
export const PDF_CJK_SANS_FULL_FAMILY = 'Source Han Sans SC Full';
export const PDF_CJK_SERIF_FULL_FAMILY = 'Source Han Serif SC Full';
export const PDF_CJK_KAI_FULL_FAMILY = 'LXGW WenKai Full';

export type ResumeFontCategory =
  | 'sans-serif'
  | 'serif'
  | 'kaiti'
  | 'glow-sans'
  | 'sarasa'
  | 'lxgw-bright'
  | 'chiron-hei'
  | 'chiron-sung'
  | 'zhuque'
  | 'lxgw-zhenkai'
  | 'qiushui'
  | 'maple-mono'
  | 'lxgw-marker';

interface CjkFamilyConfig {
  subset: string;
  /**
   * 生僻字(子集之外)回退用的 family。
   *
   * 后加的字体**不自带 full/ 源**——那要给公开仓再添几百 MB,而收益只是一个
   * 生僻字的字形更贴。它们统一回退到思源:生僻字会以另一种字形出现,但不会变豆腐块。
   */
  full: string;
  /** 内嵌的拉丁兜底,必须是 PDF 标准字体。 */
  latinFallback: string;
  /** 拼屏幕字体栈时用的 CSS 通用族。 */
  genericFamily: 'sans-serif' | 'serif' | 'monospace';
  /**
   * CSS 字体栈里含这些名字之一即命中这一档(不分大小写)。
   *
   * 存量简历里存的是系统字体栈("Songti SC", "SimSun", serif),没有这些名字,
   * 由 `getResumeFontCategory` 末尾的正则嗅探接住——那条回落必须留着,
   * 否则老简历会集体掉档。
   */
  match?: readonly string[];
  /**
   * 这一档**自身缺字**时的兜底 family,排在 latinFallback 之前。
   *
   * 只给实测覆盖不全的字体配(数字是对 charset.txt 8420 字实测的):
   * 朱雀仿宋缺 108 个汉字和 ◦ ▪ ｜,Maple Mono CN 缺 281 个汉字,
   * 霞鹜标记体缺 ◦ ▪ 两个列表符号。配了它就意味着用这一档时思源也要下载,
   * 所以字体包体积标签必须把兜底算进去(见 pdf/browser.tsx 的 packUrls)。
   */
  gapFallback?: ResumeFontCategory;
}

const CJK_FAMILY: Record<ResumeFontCategory, CjkFamilyConfig> = {
  'sans-serif': {
    subset: PDF_CJK_SANS_FAMILY,
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Helvetica',
    genericFamily: 'sans-serif',
  },
  serif: {
    subset: PDF_CJK_SERIF_FAMILY,
    full: PDF_CJK_SERIF_FULL_FAMILY,
    latinFallback: 'Times-Roman',
    genericFamily: 'serif',
  },
  kaiti: {
    subset: PDF_CJK_KAI_FAMILY,
    full: PDF_CJK_KAI_FULL_FAMILY,
    latinFallback: 'Times-Roman',
    genericFamily: 'serif',
    match: ['LXGW WenKai'],
  },
  'glow-sans': {
    subset: 'Glow Sans SC',
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Helvetica',
    genericFamily: 'sans-serif',
    match: ['Glow Sans'],
  },
  sarasa: {
    subset: 'Sarasa Gothic SC',
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Helvetica',
    genericFamily: 'sans-serif',
    match: ['Sarasa Gothic', 'Sarasa'],
  },
  'lxgw-bright': {
    subset: 'LXGW Bright GB',
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Helvetica',
    genericFamily: 'sans-serif',
    match: ['LXGW Bright'],
  },
  'chiron-hei': {
    subset: 'Chiron Hei HK',
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Helvetica',
    genericFamily: 'sans-serif',
    match: ['Chiron Hei'],
  },
  'chiron-sung': {
    subset: 'Chiron Sung HK',
    full: PDF_CJK_SERIF_FULL_FAMILY,
    latinFallback: 'Times-Roman',
    genericFamily: 'serif',
    match: ['Chiron Sung'],
  },
  zhuque: {
    subset: 'Zhuque Fangsong',
    full: PDF_CJK_SERIF_FULL_FAMILY,
    latinFallback: 'Times-Roman',
    genericFamily: 'serif',
    match: ['Zhuque Fangsong'],
    gapFallback: 'serif',
  },
  'lxgw-zhenkai': {
    subset: 'LXGW ZhenKai GB',
    full: PDF_CJK_KAI_FULL_FAMILY,
    latinFallback: 'Times-Roman',
    genericFamily: 'serif',
    match: ['LXGW ZhenKai'],
  },
  qiushui: {
    subset: 'Qiushui Shotai',
    full: PDF_CJK_KAI_FULL_FAMILY,
    latinFallback: 'Times-Roman',
    genericFamily: 'serif',
    match: ['Qiushui Shotai'],
  },
  'maple-mono': {
    subset: 'Maple Mono CN',
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Courier',
    genericFamily: 'monospace',
    match: ['Maple Mono'],
    gapFallback: 'sans-serif',
  },
  'lxgw-marker': {
    subset: 'LXGW Marker Gothic',
    full: PDF_CJK_SANS_FULL_FAMILY,
    latinFallback: 'Helvetica',
    genericFamily: 'sans-serif',
    match: ['LXGW Marker'],
    gapFallback: 'sans-serif',
  },
};

export const RESUME_FONT_CATEGORIES = Object.keys(CJK_FAMILY) as ResumeFontCategory[];

export const getResumeFontCategory = (fontStack: string): ResumeFontCategory => {
  const lower = fontStack.toLowerCase();
  for (const [id, config] of Object.entries(CJK_FAMILY) as [ResumeFontCategory, CjkFamilyConfig][]) {
    if (config.match?.some((name) => lower.includes(name.toLowerCase()))) return id;
  }

  // 存量简历存的是系统字体栈(苹方/宋体/Kaiti SC…),没有可显式匹配的 family 名,
  // 只能按栈里的通用词嗅探。楷体优先:楷体栈也含 serif,必须先于 serif 判定。
  const normalized = lower.replaceAll('sans-serif', '');
  if (/\bkaiti\b|楷/.test(normalized)) return 'kaiti';
  return /\b(serif|times|georgia|garamond|baskerville)\b/.test(normalized) ? 'serif' : 'sans-serif';
};

/** 这一档缺字时的兜底档位;没有就是 undefined。下载器据此把兜底的字体也算进包里。 */
export const getResumeFontGapFallback = (
  category: ResumeFontCategory,
): ResumeFontCategory | undefined => CJK_FAMILY[category].gapFallback;

/** 某一档的子集 family 名(下载/注册用,不经过字体栈嗅探)。 */
export const getCategorySubsetFamily = (category: ResumeFontCategory): string =>
  CJK_FAMILY[category].subset;

export const getPdfCjkFamily = (fontStack: string, preferFull = false): string => {
  const config = CJK_FAMILY[getResumeFontCategory(fontStack)];
  return preferFull ? config.full : config.subset;
};

export const getPdfFontStack = (fontStack: string, preferFull = false): string[] => {
  const config = CJK_FAMILY[getResumeFontCategory(fontStack)];
  const primary = preferFull ? config.full : config.subset;
  // 缺字兜底排在拉丁兜底之前:先试同为 CJK 的思源,再落到 PDF 标准拉丁字体。
  return config.gapFallback && !preferFull
    ? [primary, CJK_FAMILY[config.gapFallback].subset, config.latinFallback]
    : [primary, config.latinFallback];
};

export const getPdfRichTextFontFamily = (fontStack: string, preferFull = false): string =>
  getPdfCjkFamily(fontStack, preferFull);

export const getWebFontStack = (fontStack: string): string => {
  const { subset: fallbackFamily, genericFamily } = CJK_FAMILY[getResumeFontCategory(fontStack)];
  if (fontStack.includes(fallbackFamily)) return fontStack;

  const genericPattern = new RegExp(`(?:^|,\\s*)${genericFamily}\\s*$`, 'i');
  const withoutGeneric = fontStack.replace(genericPattern, '').replace(/,\s*$/, '').trim();
  return [withoutGeneric, `"${fallbackFamily}"`, genericFamily].filter(Boolean).join(', ');
};
