'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  exportResumeToImage,
  exportResumeToJson,
  exportResumeToPdf,
} from '@/lib/utils/pdf-export';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import type { Resume } from '@/types/frontend/resume';
import type { ExportFormat } from './ExportModal';

const COPY: Record<ExportFormat, { loading: string; ok: string; fail: string }> = {
  pdf: {
    loading: 'tools.exportingPDF',
    ok: 'tools.exportPDFSuccess',
    fail: 'tools.exportPDFError',
  },
  png: {
    loading: 'modals.export.imaging',
    ok: 'modals.export.imageSuccess',
    fail: 'modals.export.imageError',
  },
  // JSON 是同步序列化，不该为它闪一下 loading——那会读成"在做很重的事"。
  json: { loading: '', ok: 'modals.export.jsonSuccess', fail: '' },
};

/**
 * 导出这件事的唯一实现。
 *
 * 编辑器有两个导出入口（右下工具栏 `Tools` 与底部 `EditorDock`），此前各写了一遍几乎
 * 相同的 30 行——toast、埋点、错误处理全部重复，只差一个 `source` 字段。加格式选择时
 * 若照旧复制一遍，就成了三份要同步维护的实现。
 *
 * `source` 保留为参数：两个入口的转化率本来就该分开看。
 */
export function useResumeExport(resume: Resume, source: 'tools' | 'dock') {
  const { t, i18n } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  // 与预览渲染用同一个 locale，导出才能命中预览已经算好的那份 blob 缓存。
  const locale = i18n.resolvedLanguage || i18n.language;

  const runExport = async (format: ExportFormat) => {
    if (isExporting) return;
    setIsExporting(true);
    const copy = COPY[format];
    const toastId = copy.loading ? toast.loading(t(copy.loading)) : undefined;
    const startedAt = Date.now();
    try {
      if (format === 'pdf') await exportResumeToPdf(resume, locale);
      else if (format === 'png') await exportResumeToImage(resume, locale);
      else exportResumeToJson(resume);
      toast.success(t(copy.ok), toastId ? { id: toastId } : undefined);
      appLifecycle.resumeExported({ format, source, durationMs: Date.now() - startedAt });
    } catch (error) {
      console.error(`${format} export failed:`, error);
      if (copy.fail) toast.error(t(copy.fail), toastId ? { id: toastId } : undefined);
      // 失败和成功一样值得记：导出是这个产品交付价值的那一步，它的成功率是最该盯的数。
      appLifecycle.resumeExported({
        format,
        source,
        success: false,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return { isExporting, runExport };
}
