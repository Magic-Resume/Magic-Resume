'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Canvas, Check, Download, Plus, ZoomOut } from '@magic-resume/icons';
import { getTemplateById } from '@magic-resume/resume-templates/registry';
import { MagicResumeRenderer } from '@magic-resume/resume-templates/renderer/MagicResumeRenderer';
import { DOCUMENT_LANGUAGE_OPTIONS } from '@magic-resume/resume-schema';
import { blueLinePreviewVariants, type BlueLinePreviewVariant } from './preview-data';
import styles from './preview.module.css';

const PAPER_WIDTH = 794;
const PAPER_HEIGHT = 1123;
const template = getTemplateById('blue-line');

export default function BlueLinePreviewPage() {
  const [variant, setVariant] = useState<BlueLinePreviewVariant>('standard');
  const [documentLanguage, setDocumentLanguage] = useState<'zh' | 'en'>('zh');
  const [mounted, setMounted] = useState(false);
  const [fitScale, setFitScale] = useState(1);
  const [manualScale, setManualScale] = useState<number | null>(null);
  const [paperHeight, setPaperHeight] = useState(PAPER_HEIGHT);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const selected = blueLinePreviewVariants[variant];
  const previewResume = { ...selected.resume, documentLanguage };
  const scale = manualScale ?? fitScale;

  // Rich text is sanitized in the browser; mount the shared renderer after hydration.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const gutters = window.matchMedia('(max-width: 640px)').matches ? 32 : 80;
      setFitScale(Math.max(0.25, Math.min(1, (viewport.clientWidth - gutters) / PAPER_WIDTH)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const paper = paperRef.current;
    if (!paper) return;
    const measure = () => setPaperHeight(Math.max(PAPER_HEIGHT, paper.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [mounted]);

  const changeZoom = (amount: number) => {
    setManualScale(Math.max(0.25, Math.min(1.5, Math.round((scale + amount) * 100) / 100)));
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    setExportStatus('正在生成 PDF…');
    try {
      const { createMagicResumePdfBlob } = await import('@magic-resume/resume-templates/pdf/browser');
      const blob = await createMagicResumePdfBlob({ data: previewResume, template, locale: 'zh-CN' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Blue-Line-${variant}-${documentLanguage}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setExportStatus(`${selected.label} PDF 已生成。`);
    } catch (error) {
      console.error('Blue Line preview PDF export failed:', error);
      setExportError('PDF 导出失败，请稍后重试。');
      setExportStatus('');
    } finally {
      setExporting(false);
    }
  };

  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div className={styles.workspace} data-testid="blue-line-preview">
      <header className={styles.topbar}>
        <Link href="/dashboard" className={styles.backLink}>
          <ArrowLeft size={15} aria-hidden="true" />
          返回工作台
        </Link>
        <div className={styles.wordmark}><span className={styles.brandMark} aria-hidden="true" />Magic Resume</div>
        <span className={styles.devBadge}><span aria-hidden="true" />开发预览</span>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="模板预览设置">
          <div className={styles.templateIntro}>
            <p className={styles.eyebrow}>TEMPLATE / 020</p>
            <h1>{template.name}</h1>
            <p className={styles.introCopy}>{template.description}</p>
            <div className={styles.templateTags}><span>单栏</span><span>技术岗位</span><span>A4</span></div>
          </div>

          <fieldset className={styles.variantField}>
            <legend>切换示例</legend>
            <div className={styles.variantOptions}>
              {(Object.keys(blueLinePreviewVariants) as BlueLinePreviewVariant[]).map((key) => (
                <label key={key} className={`${styles.variantOption} ${variant === key ? styles.selected : ''}`}>
                  <input
                    type="radio" name="preview-data" value={key} checked={variant === key}
                    onChange={() => { setVariant(key); setExportError(''); setExportStatus(''); }}
                  />
                  <span className={styles.optionCopy}>
                    <span>{blueLinePreviewVariants[key].label}</span>
                    <small>{blueLinePreviewVariants[key].description}</small>
                  </span>
                  <span className={styles.checkmark} aria-hidden="true">{variant === key ? <Check size={13} /> : null}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.languageField}>
            <label htmlFor="preview-document-language">章节标题语言</label>
            <select
              id="preview-document-language" value={documentLanguage}
              onChange={(event) => { setDocumentLanguage(event.target.value as 'zh' | 'en'); setExportError(''); setExportStatus(''); }}
              aria-describedby="preview-language-hint"
            >
              {DOCUMENT_LANGUAGE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <p id="preview-language-hint">切换默认标题，示例正文保持原文。</p>
          </div>

          <div className={styles.note}>
            <span className={styles.noteLabel}>关于示例</span>
            <p>姓名、机构与项目均为虚构，仅用于展示版式。</p>
          </div>
          <Link href="/dashboard" className={styles.workspaceLink}>打开简历工作台<ArrowUpRight size={14} aria-hidden="true" /></Link>
        </aside>

        <main className={styles.main}>
          <div className={styles.toolbar}>
            <div className={styles.previewTitle}><span className={styles.previewDot} aria-hidden="true" />简历预览<span className={styles.dimensions}>794 × {paperHeight} px</span></div>
            <div className={styles.toolbarActions}>
              <div className={styles.zoomControls} aria-label="缩放预览">
                <button type="button" onClick={() => changeZoom(-0.1)} disabled={scale <= 0.25} aria-label="缩小预览"><ZoomOut size={15} aria-hidden="true" /></button>
                <output aria-label="当前缩放比例">{Math.round(scale * 100)}%</output>
                <button type="button" onClick={() => changeZoom(0.1)} disabled={scale >= 1.5} aria-label="放大预览"><Plus size={15} aria-hidden="true" /></button>
                <button type="button" className={styles.fitButton} onClick={() => setManualScale(null)} aria-label="适应宽度" title="适应宽度" aria-pressed={manualScale === null}><Canvas size={14} aria-hidden="true" /></button>
              </div>
              <button type="button" className={styles.exportButton} onClick={exportPdf} disabled={exporting || !mounted} aria-busy={exporting}>
                <Download size={15} aria-hidden="true" />{exporting ? '正在导出…' : '导出 PDF'}
              </button>
            </div>
          </div>

          {exportError ? <p role="alert" className={styles.exportError}>{exportError}</p> : null}
          <p className={styles.srOnly} role="status">{exportStatus}</p>

          <div className={styles.viewport} ref={viewportRef} tabIndex={0} aria-label="简历画布，可滚动查看完整内容">
            <div className={styles.paperFrame} style={{ width: PAPER_WIDTH * scale, height: paperHeight * scale }}>
              <div
                ref={paperRef} className={styles.paper} data-testid="resume-preview" data-variant={variant}
                style={{ width: PAPER_WIDTH, transform: `scale(${scale})` }}
              >
                {mounted ? <MagicResumeRenderer template={template} data={previewResume} locale="zh-CN" /> : <div className={styles.loading}>正在准备预览…</div>}
              </div>
            </div>
            <div className={styles.canvasCaption}><span className={styles.captionLine} />BLUE LINE<span className={styles.captionDot}>·</span>{selected.label}<span className={styles.captionLine} /></div>
          </div>
        </main>
      </div>
    </div>
  );
}
