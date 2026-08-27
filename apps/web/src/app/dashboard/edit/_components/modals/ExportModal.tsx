'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Download, FileJson, FileText, Image as ImageIcon, Loader2, X } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Resume } from '@/types/frontend/resume';

export type ExportFormat = 'pdf' | 'png' | 'json';

/**
 * 导出格式弹窗。
 *
 * 此前点「导出」直接下 PDF，没有选择余地——而三种格式服务的是三件不同的事：投递
 * （PDF）、给人看一眼（图片）、备份与迁移（JSON）。多这一步问，换来的是用户不必
 * 为了发张图去截屏。
 *
 * 默认停在 PDF：它是原有行为，也是绝大多数时候真正要的那个。
 */
const FORMATS: {
  id: ExportFormat;
  icon: typeof FileText;
  /** 图标着色。三格并排时颜色是最快的区分手段，比读字快。 */
  accent: string;
}[] = [
  { id: 'pdf', icon: FileText, accent: 'text-sky-400' },
  { id: 'png', icon: ImageIcon, accent: 'text-emerald-400' },
  { id: 'json', icon: FileJson, accent: 'text-amber-400' },
];

export default function ExportModal({
  isOpen,
  onClose,
  onExport,
  resume,
}: {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
  resume: Resume;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [busy, setBusy] = useState(false);
  // SSR 时没有 document，portal 只能在挂载后建。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onExport(format);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  // **必须 portal 到 body。** 两个调用方（Tools / EditorDock）都在带 transform 的
  // 祖先里——EditorDock 外层就是 framer 的 motion.div——而祖先一旦有 transform，
  // `position: fixed` 就不再相对视口，而是相对那个盒子：弹窗会被挤成一条窄缝，
  // 还跟着一起被缩放。portal 出去之后，它挂在哪都不受调用方的布局影响。
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={busy ? undefined : onClose}
            className="fixed inset-0 z-100 bg-black/70 backdrop-blur-sm cursor-pointer"
          />
          <div className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto w-full max-w-md rounded-2xl bg-desk p-6 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.07]"
            >
              <div className="mb-5 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/20">
                    <Download size={17} />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-semibold tracking-tight text-white">
                      {t('modals.export.title')}
                    </h2>
                    {/* 副标题报的是**这份**简历的名字，而不是又一句「选择格式」——
                        用户点开时最想确认的是"导的是不是我以为的那份"。 */}
                    <p className="mt-0.5 truncate text-[13px] text-neutral-500">
                      {resume.name || resume.info.fullName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="-mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  <X size={17} />
                </button>
              </div>

              <div role="radiogroup" className="flex flex-col gap-1.5">
                {FORMATS.map(({ id, icon: Icon, accent }) => {
                  const active = id === format;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setFormat(id)}
                      disabled={busy}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 cursor-pointer',
                        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                      )}
                    >
                      <Icon size={17} className={cn('shrink-0', accent)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-neutral-100">
                          {t(`modals.export.formats.${id}.name`)}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">
                          {t(`modals.export.formats.${id}.hint`)}
                        </span>
                      </span>
                      {active && <Check size={15} className="shrink-0 text-sky-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-lg px-4 py-2 text-[13px] text-neutral-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  {t('modals.export.cancel')}
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-[13px] font-semibold text-[#fff] transition-colors hover:bg-sky-400 disabled:opacity-50 cursor-pointer"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {t('modals.export.confirm')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
