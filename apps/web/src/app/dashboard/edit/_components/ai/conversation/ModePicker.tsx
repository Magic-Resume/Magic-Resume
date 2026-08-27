'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronUp } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  AGENT_MODES,
  AGENT_MODE_LIST,
  modeHintKey,
  modeNameKey,
  type AgentMode,
} from './modes';

/**
 * 模式控件只借当前模式的 accent 着色文字——「AI 现在能不能动我的简历」
 * 是这一行里唯一有后果的选择，但不需要靠背景色抢占注意力。
 *
 * 颜色走内联 style 而不是 Tailwind 类：类名是动态拼不出来的（Tailwind 只扫静态
 * 字符串），而 color-mix + 一个 hex 变量就够。
 */
export default function ModePicker({
  mode,
  onChange,
  disabled,
}: {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const accent = AGENT_MODES[mode].accentHex;
  const ActiveIcon = AGENT_MODES[mode].icon;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[14px] transition-colors hover:bg-white/[0.06] disabled:opacity-40 cursor-pointer"
        style={{
          color: `color-mix(in oklab, ${accent} 78%, var(--text-primary))`,
        }}
      >
        <ActiveIcon size={14} className="shrink-0" />
        {t(modeNameKey(mode))}
        <ChevronUp
          size={13}
          className={cn('shrink-0 opacity-70 transition-transform', !open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-64 origin-bottom rounded-[17px] border border-white/[0.06] bg-neutral-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            {AGENT_MODE_LIST.map((id) => {
              const active = id === mode;
              const itemAccent = AGENT_MODES[id].accentHex;
              const ItemIcon = AGENT_MODES[id].icon;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer',
                    active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.035]'
                  )}
                >
                  {/* 图元始终着本档的色，选中与否只改文字与背景——否则三行图标全是灰的，
                      "一眼分辨三档"这件事就没发生。 */}
                  <ItemIcon
                    size={15}
                    className="mt-[3px] shrink-0 transition-opacity"
                    style={{ color: itemAccent, opacity: active ? 1 : 0.75 }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-[14px] font-medium"
                      style={active ? { color: itemAccent } : { color: 'var(--text-primary)' }}
                    >
                      {t(modeNameKey(id))}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">
                      {t(modeHintKey(id))}
                    </span>
                  </span>
                  {active && (
                    <Check size={14} className="mt-0.5 shrink-0" style={{ color: itemAccent }} />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
