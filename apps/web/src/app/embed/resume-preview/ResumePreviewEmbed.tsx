'use client';

import { resolveDocumentLanguage } from '@magic-resume/resume-schema';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  PREVIEW_INVALID,
  PREVIEW_READY,
  PREVIEW_REFUSED,
  PREVIEW_RESUME,
  isAllowedParent,
  previewResume,
} from '@/lib/embed/resumePreview';
import type { Resume } from '@/types/frontend/resume';

// 与编辑器右侧预览同一个组件：后台看到的就是用户导出的那份 PDF。
const PdfCanvasPreview = dynamic(
  () =>
    import('@/app/dashboard/edit/_components/preview/PdfCanvasPreview').then(
      (m) => m.PdfCanvasPreview,
    ),
  { ssr: false },
);

export function ResumePreviewEmbed({
  allowedOrigins,
  development,
}: {
  allowedOrigins: string[];
  development: boolean;
}) {
  const [resume, setResume] = useState<Resume | null>(null);

  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== PREVIEW_RESUME)
        return;
      if (!isAllowedParent(event.origin, allowedOrigins, development)) {
        // 拒收也回一声（不带数据），否则后台只看到一张空桌面，猜不到是白名单没配。
        window.parent.postMessage({ type: PREVIEW_REFUSED }, event.origin);
        return;
      }
      const next = previewResume(event.data.resume);
      // 文案归后台：这一页没有自己的文字，解析不了就告诉父页面，由它来说。
      if (!next)
        window.parent.postMessage({ type: PREVIEW_INVALID }, event.origin);
      setResume(next);
    };
    window.addEventListener('message', onMessage);
    // 只是一声「准备好了」，不带任何数据，所以不限定目标来源；数据只从白名单来源收。
    window.parent.postMessage({ type: PREVIEW_READY }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [allowedOrigins, development]);

  return (
    <main className="bg-desk flex min-h-screen justify-center px-6 py-8">
      {resume ? (
        <PdfCanvasPreview
          resume={resume}
          locale={resolveDocumentLanguage(resume)}
        />
      ) : null}
    </main>
  );
}
