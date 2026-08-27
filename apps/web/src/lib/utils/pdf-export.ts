import type { Resume } from '@/types/frontend/resume';
import { getDefaultMagicTemplate, getMagicTemplateById } from '@magic-resume/resume-templates/config/magic-templates';
import type { MagicTemplateDSL } from '@magic-resume/resume-templates/types/magic-dsl';
import { mergeTemplateConfig } from '@/lib/utils/templateUtils';

type PdfBrowserModule = {
  createMagicResumePdfBlob: (options: {
    data: Resume;
    template: MagicTemplateDSL;
    locale?: string;
  }) => Promise<Blob>;
  warmupMagicResumePdfExport?: (template?: MagicTemplateDSL) => Promise<void>;
  inspectResumeFontPack?: (fontStack: string) => Promise<ResumeFontPack>;
  downloadResumeFontPack?: (
    fontStack: string,
    onProgress?: (ratio: number) => void,
  ) => Promise<void>;
};

/** 一档 CJK 字体的本地状态。`id` 是**档位**，多个字体共用一档。 */
export interface ResumeFontPack {
  id: string;
  ready: boolean;
  bytes: number;
}

const sanitizeFilename = (value: string): string => {
  const sanitized = value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
  return sanitized || 'resume';
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

let pdfBrowserModulePromise: Promise<PdfBrowserModule> | null = null;
const templatePromiseCache = new Map<string, Promise<MagicTemplateDSL>>();
const pdfBlobPromiseCache = new WeakMap<Resume, Map<string, Promise<Blob>>>();
const PDF_RENDERER_VERSION = 'pdf-canvas-woff2-subset-v16';

const loadPdfBrowserModule = () => {
  pdfBrowserModulePromise ??= import('@magic-resume/resume-templates/pdf/browser') as Promise<PdfBrowserModule>;
  return pdfBrowserModulePromise;
};

const loadResumeTemplate = async (resume: Resume): Promise<MagicTemplateDSL> => {
  const templateId = resume.template || 'default';
  let baseTemplatePromise = templatePromiseCache.get(templateId);

  if (!baseTemplatePromise) {
    baseTemplatePromise = (async () => {
      try {
        return await getMagicTemplateById(resume.template);
      } catch {
        return getDefaultMagicTemplate();
      }
    })();
    templatePromiseCache.set(templateId, baseTemplatePromise);
  }

  const baseTemplate = await baseTemplatePromise;
  return mergeTemplateConfig(baseTemplate, resume.customTemplate);
};

export const preloadResumePdfExport = async (resume: Resume): Promise<void> => {
  const [template, pdfModule] = await Promise.all([
    loadResumeTemplate(resume),
    loadPdfBrowserModule(),
  ]);

  await pdfModule.warmupMagicResumePdfExport?.(template);
};

/**
 * 这一档字体在本地了吗？
 *
 * **探测失败一律当成「已就绪」**：这个结果被用来拦住字体切换，宁可放过也不能把用户
 * 关在一个坏掉的探测后面——真没下载的话，切换时仍走原来的加载路径，只是慢一点。
 */
export const inspectResumeFontPack = async (fontStack: string): Promise<ResumeFontPack> => {
  try {
    const pdfModule = await loadPdfBrowserModule();
    const pack = await pdfModule.inspectResumeFontPack?.(fontStack);
    return pack ?? { id: fontStack, ready: true, bytes: 0 };
  } catch {
    return { id: fontStack, ready: true, bytes: 0 };
  }
};

/** 下载一整档字体，`onProgress` 收 0–1。失败会 reject，调用方据此显示重试。 */
export const downloadResumeFontPack = async (
  fontStack: string,
  onProgress?: (ratio: number) => void,
): Promise<void> => {
  const pdfModule = await loadPdfBrowserModule();
  await pdfModule.downloadResumeFontPack?.(fontStack, onProgress);
};

const getPdfCacheKey = (resume: Resume, locale?: string) => {
  return [
    PDF_RENDERER_VERSION,
    locale ?? '',
    resume.updatedAt,
    resume.template,
    resume.themeColor,
    resume.typography,
    // customTemplate 承载右侧面板的全部自定义(布局/排版/配色),漏掉会命中旧缓存,
    // 表现为"自定义不生效"。
    JSON.stringify(resume.customTemplate ?? null),
  ].join(':');
};

const getCachedPdfBlobPromise = (resume: Resume, locale?: string): Promise<Blob> | undefined => {
  return pdfBlobPromiseCache.get(resume)?.get(getPdfCacheKey(resume, locale));
};

const setCachedPdfBlobPromise = (resume: Resume, locale: string | undefined, promise: Promise<Blob>) => {
  let localeCache = pdfBlobPromiseCache.get(resume);
  if (!localeCache) {
    localeCache = new Map<string, Promise<Blob>>();
    pdfBlobPromiseCache.set(resume, localeCache);
  }

  localeCache.set(getPdfCacheKey(resume, locale), promise);
};

/**
 * PDF 生成走 Web Worker，主线程只负责收尾。
 *
 * 实测 `pdf().toBlob()` 是一整段同步 CPU：普通编辑 57–80ms，**换字体那一次 340–820ms**
 * （要现解析并子集化一款新 CJK 字体）。那段时间主线程停摆，预览层的交叉淡入根本播不出来。
 *
 * 降级分两种，不能混为一谈：
 *  · **worker 本身跑不起来**（构造失败 / onerror / template 结构化克隆失败）→ 永久降级到
 *    主线程。这类问题重试也没用，每重试一次就白卡一次。
 *  · **文档渲染报错**（worker 回了 ok:false）→ 原样抛给调用方，**不降级**。那是数据问题，
 *    在主线程重跑只会得到同一个错，还白白把 worker 关了。
 */
let pdfWorker: Worker | null = null;
let pdfWorkerDisabled = false;
let nextPdfRequestId = 0;

interface PdfWorkerPending {
  resolve: (blob: Blob) => void;
  reject: (error: unknown) => void;
}
const pdfWorkerPending = new Map<number, PdfWorkerPending>();

/** 标记「worker 这条路不通」，与文档本身的渲染错误区分开。 */
class PdfWorkerUnavailable extends Error {}

const disposePdfWorker = (reason: unknown) => {
  pdfWorkerDisabled = true;
  pdfWorker?.terminate();
  pdfWorker = null;
  for (const pending of pdfWorkerPending.values()) pending.reject(new PdfWorkerUnavailable(String(reason)));
  pdfWorkerPending.clear();
};

const getPdfWorker = (): Worker | null => {
  if (pdfWorkerDisabled || typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (pdfWorker) return pdfWorker;

  try {
    const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; buffer?: ArrayBuffer; message?: string }>) => {
      const { id, ok, buffer, message } = event.data;
      const pending = pdfWorkerPending.get(id);
      if (!pending) return;
      pdfWorkerPending.delete(id);
      if (ok && buffer) pending.resolve(new Blob([buffer], { type: 'application/pdf' }));
      else pending.reject(new Error(message || 'PDF worker failed.'));
    };
    worker.onerror = (event) => disposePdfWorker(event.message || 'worker error');
    pdfWorker = worker;
    return worker;
  } catch (error) {
    disposePdfWorker(error);
    return null;
  }
};

const renderPdfBlob = async (
  resume: Resume,
  template: MagicTemplateDSL,
  locale?: string,
): Promise<Blob> => {
  const worker = getPdfWorker();
  if (worker) {
    try {
      return await new Promise<Blob>((resolve, reject) => {
        const id = ++nextPdfRequestId;
        pdfWorkerPending.set(id, { resolve, reject });
        try {
          worker.postMessage({ id, resume, template, locale });
        } catch (error) {
          // 结构化克隆失败（模板里混进了不可克隆的东西）也算 worker 这条路不通。
          pdfWorkerPending.delete(id);
          reject(new PdfWorkerUnavailable(String(error)));
        }
      });
    } catch (error) {
      if (!(error instanceof PdfWorkerUnavailable)) throw error;
      disposePdfWorker(error);
      console.warn('PDF worker unavailable, falling back to the main thread.', error);
    }
  }

  const { createMagicResumePdfBlob } = await loadPdfBrowserModule();
  return createMagicResumePdfBlob({ data: resume, template, locale });
};

export const prepareResumePdfExport = async (resume: Resume, locale?: string): Promise<Blob> => {
  const cached = getCachedPdfBlobPromise(resume, locale);
  if (cached) return cached;

  const template = await loadResumeTemplate(resume);
  const blobPromise = renderPdfBlob(resume, template, locale);
  setCachedPdfBlobPromise(resume, locale, blobPromise);

  try {
    return await blobPromise;
  } catch (error) {
    pdfBlobPromiseCache.get(resume)?.delete(getPdfCacheKey(resume, locale));
    throw error;
  }
};

export const exportResumeToPdf = async (resume: Resume, locale?: string): Promise<void> => {
  const blob = await prepareResumePdfExport(resume, locale);
  downloadBlob(blob, `${sanitizeFilename(resume.name || resume.info.fullName)}.pdf`);
};

/**
 * 图片导出的渲染倍率——**按画布预算自适应，不是一个常数**。
 *
 * 渲染源是 PDF（矢量），所以"更清晰"的正确做法是用更高的倍率**重新渲染**，而不是把
 * 已经栅格化的图再放大：插值加不出细节，只会更糊。
 *
 * 但倍率不能一味调高。简历导出的 PDF 是**一页连续长图**（见 resume-templates 的
 * MagicResumePdfDocument），简历越长那一页越高，而浏览器对 canvas 有硬上限——撞上去
 * 不会报错，会静默得到一张空白图。所以先按目标倍率算出尺寸，超预算就等比降档：
 * 短简历吃满 3 倍，长简历自动退到还能安全渲染的那个值。
 */
const IMAGE_TARGET_SCALE = 3;
/** 降档下限。低于这个宁可让它超限失败，也别交出一张糊到读不出字的图。 */
const IMAGE_MIN_SCALE = 1.5;
/** 单边上限：Chrome / Firefox 的 canvas 边长上限。 */
const MAX_CANVAS_SIDE = 16384;
/** 面积上限取 2^24 —— iOS Safari 的文档值，是各家里最紧的那个，按它兜底最安全。 */
const MAX_CANVAS_AREA = 16_777_216;
/** 多页拼接时页与页之间的分隔缝，画成纸张之间的留白。 */
const IMAGE_PAGE_GAP = 24;

/** 在画布预算内能取到的最大倍率。 */
function fitScale(naturalWidth: number, naturalHeight: number): number {
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (naturalWidth * naturalHeight));
  const bySide = Math.min(MAX_CANVAS_SIDE / naturalWidth, MAX_CANVAS_SIDE / naturalHeight);
  return Math.max(IMAGE_MIN_SCALE, Math.min(IMAGE_TARGET_SCALE, byArea, bySide));
}

/**
 * 简历导出成一张长图。
 *
 * **渲染源是导出的那份 PDF，不是页面 DOM。** 用 html2canvas 去截预览意味着第二套
 * 排版实现——字体回退、分页、@react-pdf 的度量差一点，导出的图就和用户投出去的
 * PDF 对不上，而这类「预览和产物不一致」是最难查的一类问题。这里直接把 PDF blob
 * 交给 pdfjs 光栅化，两者逐像素同源。
 *
 * pdfjs 本就是依赖（预览 PdfCanvasPreview 已在用），blob 也走同一份 WeakMap 缓存，
 * 所以点了 PDF 再点图片不会重算一遍。
 */
export const exportResumeToImage = async (resume: Resume, locale?: string): Promise<void> => {
  const blob = await prepareResumePdfExport(resume, locale);
  const [{ GlobalWorkerOptions, getDocument }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
  ]);
  GlobalWorkerOptions.workerSrc ||= new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const loadingTask = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const doc = await loadingTask.promise;
  try {
    // 先量后画：拼接画布的尺寸要在渲染前定下来，否则得为每页各留一张离屏画布。
    //
    // 量两遍：第一遍取 1:1 的自然尺寸，算出这份文档能吃多大的倍率；第二遍才按那个
    // 倍率取真正用于渲染的 viewport。
    const pages = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      pages.push(await doc.getPage(i));
    }
    const natural = pages.map((page) => page.getViewport({ scale: 1 }));
    const scale = fitScale(
      Math.max(...natural.map((v) => v.width)),
      natural.reduce((sum, v) => sum + v.height, 0) + IMAGE_PAGE_GAP * (pages.length - 1)
    );
    const viewports = pages.map((page) => ({
      page,
      viewport: page.getViewport({ scale }),
    }));
    const width = Math.max(...viewports.map((v) => v.viewport.width));
    const height =
      viewports.reduce((sum, v) => sum + v.viewport.height, 0) +
      IMAGE_PAGE_GAP * (viewports.length - 1);

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    // 纸是白的：PDF 页面本身透明，不铺底色导出的 PNG 会是透明的，丢进深色聊天窗
    // 就成了一团看不清的字。
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let offsetY = 0;
    for (const { page, viewport } of viewports) {
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: [1, 0, 0, 1, (width - viewport.width) / 2, offsetY],
      }).promise;
      offsetY += viewport.height + IMAGE_PAGE_GAP;
    }

    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!png) throw new Error('canvas.toBlob returned null');
    downloadBlob(png, `${sanitizeFilename(resume.name || resume.info.fullName)}.png`);
  } finally {
    // 与预览同一套收尾：cleanup 放页面资源，destroy 关掉 worker。漏掉后者会让每次
    // 导出都留下一个常驻 worker。
    void doc.cleanup();
    void loadingTask.destroy();
  }
};

/** 简历原始数据。导出即备份，也是跨设备迁移与再导入的那条路。 */
export const exportResumeToJson = (resume: Resume): void => {
  const blob = new Blob([JSON.stringify(resume, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, `${sanitizeFilename(resume.name || resume.info.fullName)}.json`);
};
