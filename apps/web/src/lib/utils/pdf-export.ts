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
};

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

export const prepareResumePdfExport = async (resume: Resume, locale?: string): Promise<Blob> => {
  const cached = getCachedPdfBlobPromise(resume, locale);
  if (cached) return cached;

  const template = await loadResumeTemplate(resume);
  const { createMagicResumePdfBlob } = await loadPdfBrowserModule();
  const blobPromise = createMagicResumePdfBlob({ data: resume, template, locale });
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
 * 图片导出的渲染倍率。2 倍够在高分屏与微信里都不糊，再往上文件体积涨得比清晰度快。
 */
const IMAGE_SCALE = 2;
/** 多页拼接时页与页之间的分隔缝，画成纸张之间的留白。 */
const IMAGE_PAGE_GAP = 24;

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
    const viewports = [];
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      viewports.push({ page, viewport: page.getViewport({ scale: IMAGE_SCALE }) });
    }
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
