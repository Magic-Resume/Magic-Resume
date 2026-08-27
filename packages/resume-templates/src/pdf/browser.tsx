import React from 'react';
import { Font, pdf } from '@react-pdf/renderer';
import type { MagicTemplateDSL } from '../types/magic-dsl';
import type { Resume } from '../types/resume';
import {
  PDF_CJK_KAI_FAMILY,
  PDF_CJK_KAI_FULL_FAMILY,
  PDF_CJK_SANS_FAMILY,
  PDF_CJK_SANS_FULL_FAMILY,
  PDF_CJK_SERIF_FAMILY,
  PDF_CJK_SERIF_FULL_FAMILY,
  getResumeFontCategory,
  getResumeFontGapFallback,
} from '../font-family';
import { cjkSubsetCharset } from './cjk-subset-charset';
import { magicPdfHyphenationCallback } from './hyphenation';
import { MagicResumePdfDocument } from './MagicResumePdfDocument';
import { prepareBoundImageFields, prepareTemplateImages } from './prepareImages';
import { pdfImageFetchSource } from './imageFetchSource';

export interface CreateMagicResumePdfBlobOptions {
  data: Resume;
  template: MagicTemplateDSL;
  locale?: string;
}

type PdfFontCategory = ReturnType<typeof getResumeFontCategory>;
type PdfFontStyle = 'normal' | 'italic';

type PdfFontVariant = {
  filename: string;
  fontStyle?: PdfFontStyle;
  fontWeight: number;
};

const pdfFontManifest = {
  'sans-serif': {
    family: PDF_CJK_SANS_FAMILY,
    variants: [
      { filename: 'SourceHanSansSC-Regular.woff2', fontWeight: 400 },
      { filename: 'SourceHanSansSC-Bold.woff2', fontWeight: 700 },
      {
        filename: 'SourceHanSansSC-RegularOblique.woff2',
        fontWeight: 400,
        fontStyle: 'italic',
      },
      {
        filename: 'SourceHanSansSC-BoldOblique.woff2',
        fontWeight: 700,
        fontStyle: 'italic',
      },
    ],
  },
  serif: {
    family: PDF_CJK_SERIF_FAMILY,
    variants: [
      { filename: 'SourceHanSerifSC-Regular.woff2', fontWeight: 400 },
      { filename: 'SourceHanSerifSC-Bold.woff2', fontWeight: 700 },
      {
        filename: 'SourceHanSerifSC-RegularOblique.woff2',
        fontWeight: 400,
        fontStyle: 'italic',
      },
      {
        filename: 'SourceHanSerifSC-BoldOblique.woff2',
        fontWeight: 700,
        fontStyle: 'italic',
      },
    ],
  },
  // 楷体只有 Regular(400)/Medium(当 700 用),无独立斜体;斜体复用同一文件,
  // 避免 resume 含斜体文本时 @react-pdf 的 FontFamily.resolve 找不到字重而 throw。
  kaiti: {
    family: PDF_CJK_KAI_FAMILY,
    variants: [
      { filename: 'LXGWWenKai-Regular.woff2', fontWeight: 400 },
      { filename: 'LXGWWenKai-Medium.woff2', fontWeight: 700 },
      {
        filename: 'LXGWWenKai-Regular.woff2',
        fontWeight: 400,
        fontStyle: 'italic',
      },
      {
        filename: 'LXGWWenKai-Medium.woff2',
        fontWeight: 700,
        fontStyle: 'italic',
      },
    ],
  },
  // ——— 后加的十档。斜体一律不配:这些字体本身没有独立斜体,而 selectFontVariants
  // 只在简历含 <em> 时才要 italic,那时会退到同名 normal,不会 throw。 ———
  'glow-sans': {
    family: 'Glow Sans SC',
    variants: [
      { filename: 'GlowSansSC-Regular.woff2', fontWeight: 400 },
      { filename: 'GlowSansSC-Bold.woff2', fontWeight: 700 },
    ],
  },
  sarasa: {
    family: 'Sarasa Gothic SC',
    variants: [
      { filename: 'SarasaGothicSC-Regular.woff2', fontWeight: 400 },
      { filename: 'SarasaGothicSC-Bold.woff2', fontWeight: 700 },
    ],
  },
  'lxgw-bright': {
    family: 'LXGW Bright GB',
    variants: [
      { filename: 'LXGWBrightGB-Regular.woff2', fontWeight: 400 },
      { filename: 'LXGWBrightGB-Medium.woff2', fontWeight: 700 },
    ],
  },
  'chiron-hei': {
    family: 'Chiron Hei HK',
    variants: [
      { filename: 'ChironHeiHK-Regular.woff2', fontWeight: 400 },
      { filename: 'ChironHeiHK-Bold.woff2', fontWeight: 700 },
    ],
  },
  'chiron-sung': {
    family: 'Chiron Sung HK',
    variants: [
      { filename: 'ChironSungHK-Regular.woff2', fontWeight: 400 },
      { filename: 'ChironSungHK-Bold.woff2', fontWeight: 700 },
    ],
  },
  'maple-mono': {
    family: 'Maple Mono CN',
    variants: [
      { filename: 'MapleMonoCN-Regular.woff2', fontWeight: 400 },
      { filename: 'MapleMonoCN-Bold.woff2', fontWeight: 700 },
    ],
  },
  // 下面四款上游只有 Regular 一个字重,700 复用同一文件——和楷体当初的处理一致,
  // 否则 @react-pdf 的 FontFamily.resolve 找不到 700 会直接 throw。
  //
  // 复用不等于「有粗体」:react-pdf 不合成粗体,所以这几档的 <strong> 曾经与正文
  // 逐像素相同。现在由 patches/@react-pdf__{layout,textkit,render} 三个 patch 补上
  // ——把请求的 fontWeight 透传到渲染层,再用 PDF 文字渲染模式 2(填充+描边)加粗,
  // 判据与浏览器一致:要粗体、且选中的 face 自身 usWeightClass < 600。
  // 因此**字体文件里的 usWeightClass 必须说实话**(见 apps/web/scripts/build-cjk-font.py):
  // 当粗体用的 -Medium 文件要标 700,否则这里会在真 Medium 之上再描一层边。
  // 回归守卫在 scripts/render-pdf-smoke.mjs。
  zhuque: {
    family: 'Zhuque Fangsong',
    variants: [
      { filename: 'ZhuqueFangsong-Regular.woff2', fontWeight: 400 },
      { filename: 'ZhuqueFangsong-Regular.woff2', fontWeight: 700 },
    ],
  },
  'lxgw-zhenkai': {
    family: 'LXGW ZhenKai GB',
    variants: [
      { filename: 'LXGWZhenKaiGB-Regular.woff2', fontWeight: 400 },
      { filename: 'LXGWZhenKaiGB-Regular.woff2', fontWeight: 700 },
    ],
  },
  qiushui: {
    family: 'Qiushui Shotai',
    variants: [
      { filename: 'QiushuiShotai-Regular.woff2', fontWeight: 400 },
      { filename: 'QiushuiShotai-Regular.woff2', fontWeight: 700 },
    ],
  },
  'lxgw-marker': {
    family: 'LXGW Marker Gothic',
    variants: [
      { filename: 'LXGWMarkerGothic-Regular.woff2', fontWeight: 400 },
      { filename: 'LXGWMarkerGothic-Regular.woff2', fontWeight: 700 },
    ],
  },
} satisfies Record<PdfFontCategory, { family: string; variants: PdfFontVariant[] }>;

const toFullFontVariant = (variant: PdfFontVariant): PdfFontVariant => ({
  ...variant,
  filename: variant.filename.replace(/\.woff2$/, '.woff'),
});

// Parallel manifest of the full (non-subset) fonts in public/fonts/full/, keyed
// by the same category. Registered on demand for rare-glyph fallback only.
const sansFull = {
  family: PDF_CJK_SANS_FULL_FAMILY,
  variants: pdfFontManifest['sans-serif'].variants.map(toFullFontVariant),
};
const serifFull = {
  family: PDF_CJK_SERIF_FULL_FAMILY,
  variants: pdfFontManifest.serif.variants.map(toFullFontVariant),
};
const kaiFull = {
  family: PDF_CJK_KAI_FULL_FAMILY,
  variants: pdfFontManifest.kaiti.variants.map(toFullFontVariant),
};

const pdfFullFontManifest = {
  'sans-serif': {
    family: PDF_CJK_SANS_FULL_FAMILY,
    variants: pdfFontManifest['sans-serif'].variants.map(toFullFontVariant),
  },
  serif: {
    family: PDF_CJK_SERIF_FULL_FAMILY,
    variants: pdfFontManifest.serif.variants.map(toFullFontVariant),
  },
  kaiti: {
    family: PDF_CJK_KAI_FULL_FAMILY,
    variants: pdfFontManifest.kaiti.variants.map(toFullFontVariant),
  },
  // 后加的十档**没有自己的 full/ 源**——那要给公开仓再添几百 MB,而收益只是生僻字
  // 的字形更贴。它们按风格别名到思源/霞鹜文楷的完整字体:生僻字会换一种字形出现,
  // 但不会变成豆腐块。
  'glow-sans': sansFull,
  sarasa: sansFull,
  'lxgw-bright': sansFull,
  'chiron-hei': sansFull,
  'maple-mono': sansFull,
  'lxgw-marker': sansFull,
  'chiron-sung': serifFull,
  zhuque: serifFull,
  'lxgw-zhenkai': kaiFull,
  qiushui: kaiFull,
} satisfies Record<PdfFontCategory, { family: string; variants: PdfFontVariant[] }>;

const isCjkIdeographCodePoint = (codePoint: number) =>
  (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK Ext A
  (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
  (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK Compatibility Ideographs
  (codePoint >= 0x20000 && codePoint <= 0x2fa1f); // CJK Ext B–F + Compatibility Supplement

// True if the string holds a CJK ideograph outside the subset fonts. ASCII, Latin
// and CJK punctuation all sit below U+3400 (or are covered by the subset), so the
// fast path keeps this cheap on ordinary resumes.
const stringHasUnsubsettedCjk = (value: string): boolean => {
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint < 0x3400) continue;
    if (isCjkIdeographCodePoint(codePoint) && !cjkSubsetCharset.has(char)) return true;
  }
  return false;
};

// Walk the resume for any rendered rare ideograph. Skips avatar data URLs (large
// base64, never CJK) so the per-keystroke preview scan stays fast.
const resumeNeedsFullCjkFonts = (value: unknown, key?: string): boolean => {
  if (typeof value === 'string') {
    if (key === 'avatar') return false;
    return stringHasUnsubsettedCjk(value);
  }
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => resumeNeedsFullCjkFonts(item));
  return Object.entries(value as Record<string, unknown>).some(([entryKey, entryValue]) =>
    resumeNeedsFullCjkFonts(entryValue, entryKey),
  );
};

let hyphenationRegistered = false;
const registeredFontVariants = new Set<string>();
const warmupPromises = new Map<string, Promise<void>>();

const ensureHyphenationRegistered = () => {
  // 这条链路现在同时跑在主线程和 Web Worker 里，判据必须是 `self` 而不是 `window`——
  // worker 里没有 window，用旧判据会让 worker 一进来就抛。
  if (typeof self === 'undefined')
    throw new Error('PDF export is only available in the browser.');
  if (hyphenationRegistered) return;
  Font.registerHyphenationCallback(magicPdfHyphenationCallback);
  hyphenationRegistered = true;
};

const getTemplateFontCategory = (template?: MagicTemplateDSL): PdfFontCategory => {
  const fontFamily = template?.designTokens?.typography?.fontFamily?.primary ?? '';
  return getResumeFontCategory(fontFamily);
};

const fontVariantUrl = (variant: PdfFontVariant) =>
  `${self.location.origin}/fonts/${variant.filename}`;
const fullFontVariantUrl = (variant: PdfFontVariant) =>
  `${self.location.origin}/fonts/full/${variant.filename}`;

const hasItalicText = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /<(?:em|i)\b|font-style\s*:\s*italic/i.test(value);
  }

  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasItalicText);
  return Object.values(value as Record<string, unknown>).some(hasItalicText);
};

type PdfFontConfig = { family: string; variants: PdfFontVariant[] };

const selectFontVariants = (
  config: PdfFontConfig,
  options: { includeBold?: boolean; includeItalic?: boolean } = {},
): Array<PdfFontVariant & { family: string }> => {
  const requiredStyles = new Set<PdfFontStyle>(['normal']);
  if (options.includeItalic) requiredStyles.add('italic');

  return config.variants
    .filter((variant) => requiredStyles.has(variant.fontStyle ?? 'normal'))
    .filter((variant) => options.includeBold !== false || variant.fontWeight <= 400)
    .map((variant) => ({ ...variant, family: config.family }));
};

const registerFontConfig = (
  config: PdfFontConfig,
  urlOf: (variant: PdfFontVariant) => string,
  includeItalic: boolean,
) => {
  for (const variant of selectFontVariants(config, { includeItalic })) {
    const fontStyle = variant.fontStyle ?? 'normal';
    const key = `${variant.family}:${variant.fontWeight}:${fontStyle}`;
    if (registeredFontVariants.has(key)) continue;

    Font.register({
      family: variant.family,
      src: urlOf(variant),
      fontWeight: variant.fontWeight,
      fontStyle,
    });
    registeredFontVariants.add(key);
  }
};

const registerFonts = (template?: MagicTemplateDSL, data?: Resume) => {
  ensureHyphenationRegistered();
  const category = getTemplateFontCategory(template);
  const italic = hasItalicText(data);
  registerFontConfig(pdfFontManifest[category], fontVariantUrl, italic);

  // 缺字兜底档也要注册:getPdfFontStack 会把它的 family 名排进字体栈,没注册过
  // 那个名字就解析不到任何字体,兜底等于没有。
  const gap = getResumeFontGapFallback(category);
  if (gap) registerFontConfig(pdfFontManifest[gap], fontVariantUrl, italic);
};

// Register the full CJK fonts (public/fonts/full/) under their own family so a
// resume with rare ideographs renders them instead of tofu. Called only when
// resumeNeedsFullCjkFonts() found such a glyph — otherwise the 13–16MB files are
// never fetched, preserving the subset first-paint win.
const registerFullCjkFonts = (template?: MagicTemplateDSL, data?: Resume) => {
  ensureHyphenationRegistered();
  registerFontConfig(
    pdfFullFontManifest[getTemplateFontCategory(template)],
    fullFontVariantUrl,
    hasItalicText(data),
  );
};

const prefetchFont = async (url: string) => {
  try {
    await fetch(url, { cache: 'force-cache' });
  } catch {
    // Font prefetching is only a latency optimization; export can still load
    // the font normally if this background request is interrupted.
  }
};

/**
 * 把某一档 CJK 字体拉进 HTTP 缓存。**下载与渲染在这里被拆成两步。**
 *
 * 原来两者是缠在一起的：`registerFonts()` 只把 URL 交给 react-pdf，真正的下载发生在
 * `toBlob()` 内部——于是用户点下「宋体」到预览出现之间，夹着一次 4MB 的传输，而屏幕
 * 上只有骨架屏。字体档位一共就三档（sans / serif / kaiti），完全可以在用户**还没点**
 * 的时候就取回来。
 *
 * 按档位去重：同一档只发一次请求，重复调用拿到同一个 promise。
 */
const warmupFontCategory = (category: PdfFontCategory, includeBold: boolean): Promise<void> => {
  ensureHyphenationRegistered();

  const cacheKey = `${self.location.origin}:${category}:${includeBold ? 'b' : 'r'}`;
  const cached = warmupPromises.get(cacheKey);
  if (cached) return cached;

  const urls = selectFontVariants(pdfFontManifest[category], {
    includeBold,
  }).map(fontVariantUrl);
  const promise = Promise.all(urls.map(prefetchFont)).then(() => undefined);
  warmupPromises.set(cacheKey, promise);
  return promise;
};

/**
 * 导出按钮的预热：只取 Regular。
 *
 * 和下面的「字体包」是**不同粒度**，不是重复实现——导出预热要的是首屏那一次导出快一点，
 * 而字体包要的是「换到这一档所需的全部字重」。两者共用 HTTP 缓存，重叠的 Regular
 * 第二次会直接命中。
 */
export const warmupMagicResumePdfExport = (template?: MagicTemplateDSL): Promise<void> =>
  warmupFontCategory(getTemplateFontCategory(template), false);

// ---------------------------------------------------------------------------
// 字体包：可探测、可下载、可显示进度
// ---------------------------------------------------------------------------

/**
 * 一档 CJK 字体（Regular + Bold）的状态。
 *
 * **档位不是字体名。** 面板里十几个可选字体只对应三个包：苹方 / 雅黑 / 思源黑 / Inter
 * 全走黑体包，宋体 / Georgia / Times 走宋体包，楷体单独一个。所以下好宋体之后 Georgia
 * 是立刻可切的——UI 必须按 `id` 而不是按字体名归并状态，否则会显示成三次下载。
 *
 * 斜体不含在包里：它只有简历真的含 `<em>` 时才注册，属于少数情况，不值得让每个人
 * 多等 3MB。那种简历切档时仍会有一次短暂的补下载。
 */
export interface ResumeFontPack {
  id: PdfFontCategory;
  ready: boolean;
  /** Regular + Bold 的字节数；探测不到时为 0（UI 应据此隐藏体积标签）。 */
  bytes: number;
}

const packReady = new Map<PdfFontCategory, boolean>();
const packBytes = new Map<PdfFontCategory, number>();

/**
 * 一档要下载的全部文件。
 *
 * 去重是必须的:只有 Regular 一个字重的字体,400 和 700 指向同一个文件,不去重会
 * 把体积算成两倍、也会重复请求。缺字兜底档的文件也算进来——用朱雀仿宋就是真的要
 * 连思源宋一起下,体积标签不能瞒着这一半。
 */
const packUrls = (category: PdfFontCategory) => {
  const gap = getResumeFontGapFallback(category);
  const categories: PdfFontCategory[] = gap ? [category, gap] : [category];
  return [
    ...new Set(
      categories.flatMap((id) =>
        selectFontVariants(pdfFontManifest[id], { includeBold: true }).map(fontVariantUrl),
      ),
    ),
  ];
};

/**
 * 只查 HTTP 缓存、**不发网络请求**：未命中时 `only-if-cached` 会 reject（个别实现返回
 * 504），两种都当作「没缓存」。这是浏览器唯一可查询缓存命中的途径——`localStorage`
 * 记标记会撒谎，因为缓存可能被驱逐。
 */
const cachedSize = async (url: string): Promise<number | null> => {
  try {
    const response = await fetch(url, {
      cache: 'only-if-cached',
      mode: 'same-origin',
    });
    void response.body?.cancel();
    return response.ok ? Number(response.headers.get('content-length')) || 0 : null;
  } catch {
    return null;
  }
};

const headSize = async (url: string): Promise<number> => {
  try {
    const response = await fetch(url, { method: 'HEAD', mode: 'same-origin' });
    return response.ok ? Number(response.headers.get('content-length')) || 0 : 0;
  } catch {
    return 0;
  }
};

const inspections = new Map<PdfFontCategory, Promise<ResumeFontPack>>();

/**
 * 这一档在本地了吗？多大？收 `fontStack` 而不是 category —— 归档规则留在这一层。
 *
 * 同档并发去重：面板一次要问十几个字体，但它们只落在三档上；不去重就会发出几十个
 * 探测请求。
 */
export const inspectResumeFontPack = (fontStack: string): Promise<ResumeFontPack> => {
  const id = getResumeFontCategory(fontStack);
  if (packReady.get(id)) return Promise.resolve({ id, ready: true, bytes: packBytes.get(id) ?? 0 });

  const inflight = inspections.get(id);
  if (inflight) return inflight;

  const probe = probePack(id);
  inspections.set(id, probe);
  void probe.catch(() => undefined).finally(() => inspections.delete(id));
  return probe;
};

const probePack = async (id: PdfFontCategory): Promise<ResumeFontPack> => {
  const urls = packUrls(id);
  const cached = await Promise.all(urls.map(cachedSize));
  const ready = cached.every((size) => size !== null);
  const sizes = ready ? (cached as number[]) : await Promise.all(urls.map(headSize));

  packBytes.set(
    id,
    sizes.reduce((sum, size) => sum + size, 0),
  );
  if (ready) packReady.set(id, true);
  return { id, ready, bytes: packBytes.get(id) ?? 0 };
};

interface PackDownload {
  promise: Promise<void>;
  listeners: Set<(ratio: number) => void>;
  ratio: number;
}

const downloads = new Map<PdfFontCategory, PackDownload>();

const runPackDownload = async (category: PdfFontCategory, emit: (ratio: number) => void) => {
  const urls = packUrls(category);
  let total = packBytes.get(category) ?? 0;
  let loaded = 0;

  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`font ${response.status} ${url}`);

      const reader = response.body?.getReader();
      if (!reader) {
        // 拿不到流就没有进度可报，但字节仍会进 HTTP 缓存 —— 下载本身照样成立。
        await response.arrayBuffer();
        return;
      }
      // 体积探测失败时用 content-length 现补，否则进度条会一直停在 0。
      if (total === 0) total = Number(response.headers.get('content-length')) * urls.length || 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        if (total > 0) emit(Math.min(0.999, loaded / total));
      }
    }),
  );

  packReady.set(category, true);
  emit(1);
};

/**
 * 下载一整档字体，`onProgress` 收 0–1。
 *
 * 同一档并发调用共享同一次下载：悬停预取先开始、随后点击的那次只是挂上一个进度监听，
 * 不会再发一遍请求。失败会把记录清掉，于是「重试」是有意义的。
 */
export const downloadResumeFontPack = (
  fontStack: string,
  onProgress?: (ratio: number) => void,
): Promise<void> => {
  ensureHyphenationRegistered();
  const category = getResumeFontCategory(fontStack);

  let entry = downloads.get(category);
  if (!entry) {
    const created: PackDownload = {
      promise: Promise.resolve(),
      listeners: new Set(),
      ratio: 0,
    };
    const emit = (ratio: number) => {
      created.ratio = ratio;
      for (const listener of created.listeners) listener(ratio);
    };
    created.promise = runPackDownload(category, emit).catch((error) => {
      downloads.delete(category);
      throw error;
    });
    downloads.set(category, created);
    entry = created;
  }

  if (onProgress) {
    const listeners = entry.listeners;
    listeners.add(onProgress);
    onProgress(entry.ratio);
    void entry.promise.catch(() => undefined).finally(() => listeners.delete(onProgress));
  }
  return entry.promise;
};


// 兜底转码:react-pdf(4.5.1)只认 PNG/JPEG,传 webp 会报 "Base64 image invalid format: webp"
// (表现为「占了位却不画像素」)。我们自己传的头像现在已是 JPEG(直接跳过此转码),这里只兜底
// 处理非 PNG/JPEG 的来源:用户粘贴的 webp/avif URL、以及历史遗留的 webp 对象。关键:先 fetch
// 成 blob 再用 objectURL 画进 canvas —— objectURL 同源,不会污染 canvas,toDataURL 才不会抛
// SecurityError(直接把远程 URL 塞进 <img> 画则会被污染)。
//
// `mime` 必须由调用方给:头像转 JPEG 是因为照片体积远小于 PNG,而**品牌 logo 必须转 PNG**——
// JPEG 无 alpha,下面那层白底会让透明 logo 在深色版式上变成一块白斑。
const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });

// Worker 里没有 `Image` 也没有 `document`，转码走 createImageBitmap + OffscreenCanvas。
// 语义与下面主线程那条完全一致（含 JPEG 铺白底），只是换了一套 API。
const imageBlobToDataUrlOffscreen = async (blob: Blob, mime: string): Promise<string> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width || 1, bitmap.height || 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable.');
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    return await blobToDataUrl(await canvas.convertToBlob({ type: mime, quality: 0.9 }));
  } finally {
    bitmap.close();
  }
};

const imageBlobToDataUrl = (blob: Blob, mime: string): Promise<string> => {
  if (typeof document === 'undefined') return imageBlobToDataUrlOffscreen(blob, mime);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1;
        canvas.height = img.naturalHeight || 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D context unavailable.');
        // JPEG 无 alpha:先铺白底,透明区(如透明 PNG/webp)否则会变黑。PNG 保留透明,不铺。
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL(mime, 0.9));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to encode image.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image.'));
    };
    img.src = url;
  });
};

// Cache the remote → data-URL conversion by URL. The live preview re-runs this
// pipeline on every (debounced) edit, so without memoization each keystroke
// burst would re-fetch and re-encode the same remote image. Logos make this
// sharper still: one resume can reference a dozen of them.
const imageDataUrlCache = new Map<string, Promise<string>>();

const fetchImageDataUrl = (src: string, mime: string): Promise<string> => {
  const cacheKey = `${mime}|${src}`;
  let promise = imageDataUrlCache.get(cacheKey);
  if (!promise) {
    promise = (async () => {
      // `reload`(强制走网络)而非 `force-cache`:这些对象带 immutable 一年强缓存,若浏览器
      // 早前用 <img>(no-cors)缓存过它,force-cache 会复用那份「无 CORS 头」的旧响应,导致这里
      // 的 cors fetch 被拦、图被静默丢弃。会话内已有 imageDataUrlCache 去重,重取不影响性能。
      const response = await fetch(pdfImageFetchSource(src), {
        cache: 'reload',
      });
      if (!response.ok) throw new Error(`Image request failed with ${response.status}.`);
      return imageBlobToDataUrl(await response.blob(), mime);
    })();
    // Never cache a rejection — allow the next render to retry a failed fetch.
    void promise.catch(() => imageDataUrlCache.delete(cacheKey));
    imageDataUrlCache.set(cacheKey, promise);
  }
  return promise;
};

/** react-pdf 直接画得出来的来源:PNG/JPEG data URL,以及它自带解析器的 SVG。 */
const isPdfReadySrc = (src: string): boolean => /^data:image\/(png|jpe?g|svg\+xml);/i.test(src);

/**
 * 把一个图片来源变成 react-pdf 一定画得出来的 data URL。
 *
 * 这是**导出链路上唯一一层兜底**,而它兜的三件事失败时全是静默的:react-pdf 只认
 * jpg/png/svg(ico、webp、gif 一概不认)、浏览器里它用 `fetch` 拉远程图所以需要 CORS、
 * 而失败只落一条 `console.warn` 后 `if (!node.image?.data) return`。
 * 三条合起来的表现就是「屏幕上有、导出的 PDF 里没有,且不报错」。
 */
const toPdfReadyDataUrl = async (src: string, mime: string): Promise<string> => {
  if (isPdfReadySrc(src)) return src;
  if (src.startsWith('data:')) {
    return imageBlobToDataUrl(await (await fetch(src)).blob(), mime);
  }
  return fetchImageDataUrl(src, mime);
};

const prepareResumeImages = async (data: Resume): Promise<Resume> => {
  // 遍历逻辑在 `./prepareImages`（无 DOM 依赖，可测）；这里只提供浏览器侧的转码器。
  const withTemplate = data.templateOverride
    ? {
        ...data,
        templateOverride: await prepareTemplateImages(data.templateOverride, toPdfReadyDataUrl),
        sections: await prepareBoundImageFields(data.sections, toPdfReadyDataUrl),
      }
    : data;

  const avatar = withTemplate.info.avatar;
  if (!avatar) return withTemplate;
  // 已是 react-pdf 认得的 PNG/JPEG data URL 就直接用;远程 URL 与 webp data URL(self-hosted
  // 内嵌)都要转码,否则 react-pdf 报 "Base64 image invalid format"。
  if (/^data:image\/(png|jpe?g);/i.test(avatar)) return withTemplate;

  try {
    // 头像保持 JPEG:那是照片,体积远小于 PNG,且没有透明区要保。
    const dataUrl = await toPdfReadyDataUrl(avatar, 'image/jpeg');
    return { ...withTemplate, info: { ...withTemplate.info, avatar: dataUrl } };
  } catch {
    // A remote avatar should not prevent the rest of the resume from exporting.
    return { ...withTemplate, info: { ...withTemplate.info, avatar: '' } };
  }
};

export const createMagicResumePdfBlob = async ({
  data,
  template,
  locale,
}: CreateMagicResumePdfBlobOptions): Promise<Blob> => {
  registerFonts(template, data);
  const cjkFallback = resumeNeedsFullCjkFonts(data);
  if (cjkFallback) registerFullCjkFonts(template, data);
  const preparedData = await prepareResumeImages(data);
  const document = (
    <MagicResumePdfDocument
      data={preparedData}
      template={template}
      locale={locale}
      cjkFallback={cjkFallback}
    />
  );

  return pdf(document).toBlob();
};
