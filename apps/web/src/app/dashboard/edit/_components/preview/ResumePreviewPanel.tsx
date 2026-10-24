"use client";

import { resolveDocumentLanguage } from '@magic-resume/resume-schema';
import React from 'react';
import dynamic from 'next/dynamic';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Resume } from '@/types/frontend/resume';
import useMobile from '@/hooks/useMobile';
import { Tools } from '../layout/Tools';
import { EditorDock } from '../layout/EditorDock';
import { useTranslation } from 'react-i18next';
import { PaperSkeleton } from './PaperSkeleton';

// The canvas preview is client-only: pdf.js needs window/devicePixelRatio and a
// <canvas>, and registers a worker at module load — none of which work during SSR.
// Load it with ssr:false so it renders only in the browser.
// loading 必须给同款占位纸:这个 chunk 含 pdf.js,加载期不短;没有 fallback 时画布是
// 纯黑的,dock 悬浮在黑洞上("工具栏浮在空画布"的丑态)。占位纸与组件内部首帧 loader
// 同构同相位(见 PaperSkeleton),chunk 就绪的交接肉眼不可见。
const PdfCanvasPreview = dynamic(
  () => import('./PdfCanvasPreview').then((m) => m.PdfCanvasPreview),
  { ssr: false, loading: () => <PaperSkeleton /> },
);

interface ResumePreviewPanelProps {
  activeResume: Resume | null;
  onJsonClick: () => void;
}

const ResumePreviewPanel: React.FC<ResumePreviewPanelProps> = ({
  activeResume,
  onJsonClick,
}) => {
  const { isMobile } = useMobile();
  const { t } = useTranslation();

  if (!activeResume) {
    return (
      <section className="min-w-0 flex-1 flex items-center justify-center bg-desk relative overflow-hidden max-h-screen">
        <div className="text-white">{t('common.loading')}</div>
      </section>
    );
  }

  return (
    <section className="min-w-0 flex-1 flex items-center justify-center bg-desk relative overflow-hidden max-h-screen">

      <TransformWrapper
        initialScale={0.6}
        minScale={0.5}
        maxScale={2}
        limitToBounds={false}
        onInit={(controls) => controls.centerView(0.5, 0)}
        onPanningStart={() => document.body.classList.add('grabbing')}
        onPanningStop={() => document.body.classList.remove('grabbing')}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%',maxHeight: '100vh' }}
              contentStyle={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: '100%', height: '100%', paddingTop: '5rem', paddingBottom: '5rem' }}
            >
              <div className="relative">
                <PdfCanvasPreview resume={activeResume} locale={resolveDocumentLanguage(activeResume)} />
              </div>
            </TransformComponent>

            {isMobile ? (
              <Tools
                isMobile
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                resetTransform={resetTransform}
                resume={activeResume}
              />
            ) : (
              <EditorDock
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                resetTransform={resetTransform}
                resume={activeResume}
                onJsonClick={onJsonClick}
              />
            )}
          </>
        )}
      </TransformWrapper>

    </section>
  );
};

export default ResumePreviewPanel;
