import React from 'react';
import { Document, Page } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ResolvedNode, ResolvedPage } from '../ir';
import { FREE_FORM_PAGE_SIZE, getFreeFormPageMinHeight } from '../../pdf/page-size';
import { renderNode, type PdfRenderContext } from './renderNode';

/**
 * 文档级 PDF 入口：一棵**整份模板**的树 → `<Document>`。
 *
 * 与 `pdf/renderNode.tsx` 的分工：那个画节点，这个决定纸张。分页是文档级属性，
 * 塞进节点渲染器就等于让每个 Box 都能改变纸张尺寸。
 *
 * 现阶段（第 3 期）只有分区级预设在用原语树，它们渲染在既有 `MagicResumePdfDocument`
 * 的 `<Page>` 里，走不到这里。这个入口是给第 4 期准备的——那时整棵模板树存在简历上，
 * 由它自己决定纸张。**先建好并测好，比第 4 期临时补要安全**：分页一旦上线就会影响
 * 所有导出，不该在赶功能的时候第一次写。
 *
 * ## 两种模式
 *
 * - **`single`（默认）**：只给宽不给高，单个 `<Page>` 随内容长高，**不分页**。
 *   这是既有 19 个模板的行为，理由是产品面向线上投递与分享链接，连续阅读优于分页，
 *   不会有经历被拦腰截断；代价是打印会被缩放或裁切。
 * - **`paged`**：真正的 A4/Letter 分页。此时 `keepTogether` 才有语义——
 *   它编译成 `wrap={false}`，让一个条目不被页边界从中间劈开。
 *
 * 默认值等于既定行为，所以老模板加不加这个字段都一样。
 */

const PAGE_POINTS = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
} as const;

export interface TreeDocumentOptions extends PdfRenderContext {
  /**
   * `single` 模式下的页宽（点）。省略按 A4 宽。
   * `paged` 模式下忽略——那时宽度由纸张规格决定。
   */
  width?: number;
}

export function renderTreeDocument(
  root: ResolvedNode | null,
  page: ResolvedPage,
  options: TreeDocumentOptions,
): React.ReactElement<DocumentProps> {
  const { width, ...ctx } = options;

  if (page.mode === 'paged') {
    const size = PAGE_POINTS[page.size];
    return (
      <Document>
        <Page
          size={[size.width, size.height]}
          // 原语树里大多数文案是 `Text`，不是 `RichText`。若只由富文本组件
          // 自己设置字体，栏目标题、公司名、职位等会回落到 PDF 默认 Helvetica，
          // 中文就会被错误地编码/映射。字体必须从 Page 继承到整棵树。
          style={{ padding: page.marginPoints, fontFamily: ctx.fontFamily }}
        >
          {root ? renderNode(root, ctx) : null}
        </Page>
      </Document>
    );
  }

  // 只给宽不给高 → 页面随内容长高。最小高度按纸张纵横比，
  // 免得一份很短的简历渲成一张扁条——与 HTML 侧 `Layout.tsx` 的 pageMinHeight 语义一致。
  const pageWidth = width ?? FREE_FORM_PAGE_SIZE.width;
  return (
    <Document>
      <Page
        size={{ width: pageWidth }}
        style={{
          padding: page.marginPoints,
          minHeight: getFreeFormPageMinHeight(pageWidth, page.size),
          // 与 paged 分支相同：确保普通 Text、List 与 RichText 使用同一套
          // 已注册的 CJK 字体，而不是让前两者静默回落到 Helvetica。
          fontFamily: ctx.fontFamily,
        }}
      >
        {root ? renderNode(root, ctx) : null}
      </Page>
    </Document>
  );
}
