'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { X, Check, CornerDownRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ChangeRow = {
  path: string;
  label: string;
  rationale: string;
  isInsert?: boolean;
};

type ChangesPanelProps = {
  rows: ChangeRow[];
  onJump: (path: string) => void;
  /**
   * 逐条接受/丢弃。
   *
   * 此前每一行只能「跳转到画布」，而接受的 ✓ 长在就地卡片上——于是模板不给渲染锚点的字段
   * （company / position / date 这类，模板只给正文类字段包 Editable）只能靠「全部接受」
   * 一次性应用，想单独采纳其中一条是做不到的。改动本身完全有效，缺的只是一个按钮。
   */
  onAccept: (path: string) => void;
  onDiscard: (path: string) => void;
  onAcceptAll: () => void;
  onDiscardAll: () => void;
  onClose: () => void;
};

/** The "all changes" summary entry (design §8.4) — list + jump + bulk actions. */
export default function ChangesPanel({
  rows,
  onJump,
  onAccept,
  onDiscard,
  onAcceptAll,
  onDiscardAll,
  onClose,
}: ChangesPanelProps) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute right-4 top-12 z-40 w-[300px] max-h-[60%] flex flex-col rounded-2xl bg-neutral-900 border border-neutral-800 shadow-[0_12px_36px_rgba(0,0,0,0.15)] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5 shrink-0">
        <span className="text-xs font-medium text-white">{t('aiLab.living.allChanges')}</span>
        <span className="text-[11px] text-neutral-500">{t('aiLab.living.changeCountShort', { count: rows.length })}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="ml-auto text-neutral-500 hover:text-white transition-colors cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-1.5">
        {rows.map((r) => (
          <div
            key={r.path}
            className="group rounded-xl px-2.5 py-2 hover:bg-neutral-800/70 transition-colors flex items-start gap-2"
          >
            <button
              type="button"
              onClick={() => onJump(r.path)}
              className="min-w-0 flex-1 text-left flex gap-2 cursor-pointer"
            >
              <CornerDownRight size={13} className="text-neutral-600 group-hover:text-sky-400 mt-0.5 shrink-0 transition-colors" />
              <div className="min-w-0">
                <div className="text-xs text-neutral-200 truncate">
                  {r.label}
                  {r.isInsert && <span className="ml-1.5 text-[10px] text-emerald-400">{t('aiLab.living.inserted')}</span>}
                </div>
                <div className="text-[11px] text-neutral-500 truncate">{r.rationale}</div>
              </div>
            </button>
            {/* 逐条采纳/丢弃。就地卡片上有同样的一对；这里是它们在列表里的等价物，
                也是没有锚点的那些改动唯一的操作入口。 */}
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => onAccept(r.path)}
                aria-label={t('aiLab.living.accept')}
                title={t('aiLab.living.accept')}
                className="p-1 rounded-lg text-neutral-500 hover:text-emerald-400 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDiscard(r.path)}
                aria-label={t('aiLab.living.discard')}
                title={t('aiLab.living.discard')}
                className="p-1 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-6 text-center text-[11px] text-neutral-600">{t('aiLab.living.emptyChanges')}</div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="flex items-center gap-2 px-2.5 py-2 shrink-0 border-t border-neutral-800/70">
          <button
            type="button"
            onClick={onDiscardAll}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg text-neutral-400 hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            {t('aiLab.living.discardAll')}
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            <Check size={13} />
            {t('aiLab.living.acceptAll')}
          </button>
        </div>
      )}
    </motion.div>
  );
}
