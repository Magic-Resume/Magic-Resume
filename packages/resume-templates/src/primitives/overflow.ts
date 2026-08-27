import { renderToBuffer } from '@react-pdf/renderer';
import type { TemplateDocument } from './ast';
import { compile } from './compile';
import { renderTreeDocument } from './pdf/document';
import { validateTemplate } from './validate';

/**
 * 溢出自检：把模板真的渲染成 PDF，回答「放得下吗、画得出吗」。
 *
 * ## 为什么必须真渲染，不能估算
 *
 * 排版是文字度量的函数——同一段中文在不同字体、不同字号下的换行位置完全不同，
 * 而 react-pdf 用的是自己的 textkit（我们仓库还打着 `@react-pdf__textkit` 的补丁）。
 * 任何「按字符数估行数」的近似都会在最需要它的地方（内容刚好卡在页边界）出错。
 * 而真渲染在这里**很便宜**：`renderToBuffer` 不需要浏览器，`render-pdf-smoke.mjs`
 * 已经证明它能在 Node 里跑完 19 个模板。
 *
 * ## 它是 `MeasureFn` 的**一个**实现，不是唯一的那个
 *
 * 复刻闭环里「放不放得下」这一项是注入的（`CritiqueOptions.measure`）。
 * **真实产品路径上首选浏览器测量**：浏览器里已经装着两个渲染器，而且测得更准——
 * 真实字体（CJK 子集字体与服务端注册的并不一样）、真实 DOM 布局。
 * 服务端要重新注册一遍字体去逼近浏览器的结果，是把简单的事做复杂。
 *
 * 这个 Node 版存在的理由是 **CI 与冒烟需要一个不依赖浏览器的量法**——
 * 那是它的主场，不是产品主路径。
 *
 * ## 运行环境
 *
 * **Node 专用。** `renderToBuffer` 在浏览器里没有；浏览器侧用 `pdf().toBlob()`。
 */

export interface OverflowReport {
  /** 渲染成功与否。失败时 `pages` 为 0，`error` 有值。 */
  ok: boolean;
  /** 实际页数。`single` 模式恒为 1（页面随内容长高）。 */
  pages: number;
  /** PDF 字节数。异常膨胀往往意味着图片没压缩或字体没子集化。 */
  bytes: number;
  /** 超出 `maxPages` 了吗。`single` 模式下恒为 false。 */
  overflow: boolean;
  /** 编译期与校验期的诊断，原样带出。 */
  diagnostics: string[];
  error?: string;
}

export interface OverflowCheckOptions {
  fontFamily: string;
  /** 允许几页。默认 1——简历超过一页是要主动决定的事，不该悄悄发生。 */
  maxPages?: number;
  /** `single` 模式下的页宽（点）。 */
  width?: number;
}

/** 从 PDF 字节里读页数。`/Type /Catalog` 下的 `/Count` 是页树总数。 */
export const pageCountOf = (buffer: Uint8Array): number => {
  const text = Buffer.from(buffer).toString('latin1');
  // 取最大的那个 /Count：页树可能有中间节点，各自带自己的 Count。
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return counts.length ? Math.max(...counts) : 0;
};

/** 包成 `MeasureFn` 交给 critique。参数在这里绑好，调用方只管调。 */
export const createNodeMeasurer =
  (options: OverflowCheckOptions) =>
  async (doc: TemplateDocument, resume: Record<string, unknown>) => {
    const r = await checkOverflow(doc, resume, options);
    return { ok: r.ok, pages: r.pages, bytes: r.bytes, error: r.error };
  };

export async function checkOverflow(
  doc: TemplateDocument,
  resume: Record<string, unknown>,
  options: OverflowCheckOptions,
): Promise<OverflowReport> {
  const maxPages = options.maxPages ?? 1;
  const diagnostics: string[] = [];

  const checked = validateTemplate(doc);
  diagnostics.push(...checked.diagnostics.map((d) => d.message));
  if (!checked.ok) {
    // 结构就不合法时不必渲染——渲出来的失败原因会指向排版，而真正的问题在结构。
    return { ok: false, pages: 0, bytes: 0, overflow: false, diagnostics, error: '模板未通过校验' };
  }

  const { root, page, diagnostics: compileDiagnostics } = compile(doc, resume);
  diagnostics.push(...compileDiagnostics.map((d) => d.message));
  if (!root) {
    return { ok: false, pages: 0, bytes: 0, overflow: false, diagnostics, error: '编译没有产出节点' };
  }

  try {
    const buffer = await renderToBuffer(
      renderTreeDocument(root, page, { fontFamily: options.fontFamily, width: options.width }),
    );
    const pages = pageCountOf(buffer);
    return {
      ok: true,
      pages,
      bytes: buffer.length,
      // `single` 模式没有页边界，"超页"这个概念不成立——报 true 会让复刻闭环
      // 去修一个不存在的问题，而模型对着不存在的问题会一直改下去。
      overflow: page.mode === 'paged' && pages > maxPages,
      diagnostics,
    };
  } catch (error) {
    // 渲染抛异常是最值钱的一类信号：字体没注册、字重没注册、图片取不到，
    // 全都在这里现形，而且在用户点导出**之前**。
    return {
      ok: false,
      pages: 0,
      bytes: 0,
      overflow: false,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
