/// <reference lib="webworker" />
/**
 * PDF 生成的 Web Worker。
 *
 * 存在的理由是**主线程会被卡死**：`pdf().toBlob()` 是一整段同步 CPU（排版 + fontkit
 * 嵌入 + 序列化）。实测(Node，1251 字符样本简历)普通编辑 57–80ms，而**换字体那一次
 * 340–820ms**——因为要现解析并子集化一款新的 CJK 字体。浏览器里更慢、真实简历更长。
 * 那段时间里 React 更新、CSS 过渡、滚动全部停摆，所以预览层的交叉淡入根本没机会播。
 *
 * 挪进 worker 之后主线程只剩 postMessage 和最后把 ArrayBuffer 包成 Blob。
 *
 * 头像/logo 的 data-URL 化也在这里跑（`createMagicResumePdfBlob` 内部调）。worker 里
 * 没有 `Image`/`document`，所以 browser.tsx 的转码走 createImageBitmap + OffscreenCanvas
 * 那条分支——两条分支语义一致，含 JPEG 铺白底。
 */
import type { MagicTemplateDSL } from '@magic-resume/resume-templates/types/magic-dsl';
import type { Resume } from '@/types/frontend/resume';

export interface PdfWorkerRequest {
  id: number;
  resume: Resume;
  template: MagicTemplateDSL;
  locale?: string;
}

export type PdfWorkerResponse =
  | { id: number; ok: true; buffer: ArrayBuffer }
  | { id: number; ok: false; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<PdfWorkerRequest>) => {
  const { id, resume, template, locale } = event.data;

  void (async () => {
    try {
      // 动态 import：worker 启动本身要快，重包等第一条消息到了再拉。
      const { createMagicResumePdfBlob } = await import(
        '@magic-resume/resume-templates/pdf/browser'
      );
      const blob = await createMagicResumePdfBlob({ data: resume, template, locale });
      const buffer = await blob.arrayBuffer();
      // 转移所有权而不是结构化克隆：几百 KB 的拷贝正是我们想省掉的东西。
      ctx.postMessage({ id, ok: true, buffer } satisfies PdfWorkerResponse, [buffer]);
    } catch (error) {
      ctx.postMessage({
        id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      } satisfies PdfWorkerResponse);
    }
  })();
});
