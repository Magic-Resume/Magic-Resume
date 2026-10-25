"use client";

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronUp } from '@magic-resume-kit/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useSettingStore, type Strength } from '@/store/useSettingStore';
import { useSettingsUiStore } from '@/store/useSettingsUiStore';
import { EASE_ENTER } from '@magic-resume-kit/utils';
import ModelMark from './ModelMark';
import { effectiveEffort } from '../lib/reasoningEffort';

const STRENGTHS: Strength[] = ['low', 'medium', 'high'];

export default function ModelStrengthPicker({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const model = useSettingStore((s) => s.model);
  const strength = useSettingStore((s) => s.strength);
  const setStrength = useSettingStore((s) => s.setStrength);
  const openSettings = useSettingsUiStore((s) => s.openSettings);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const modelLabel = model || t('settings.llm.statusNotConfigured');
  const strengthLabel = t(`aiLab.picker.strength.${strength}`);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    rootRef.current?.addEventListener('keydown', onKey);
    const root = rootRef.current;
    return () => {
      document.removeEventListener('mousedown', onDown);
      root?.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button type="button" disabled={disabled} onClick={() => setOpen((value) => !value)}
        aria-label={`${modelLabel} · ${strengthLabel}`} title={`${modelLabel} · ${strengthLabel}`}
        aria-expanded={open} aria-haspopup="dialog"
        className="inline-flex h-[38px] min-w-0 max-w-full sm:max-w-[260px] items-center gap-1.5 rounded-full pl-1 pr-2 text-mr-body text-text-primary transition-colors hover:bg-mr-surface-soft disabled:opacity-40 cursor-pointer">
        <ModelMark model={model} generic={!model} size={26} />
        <span className="min-w-0 truncate">{modelLabel}<span className="text-text-secondary"> · {strengthLabel}</span></span>
        <ChevronUp size={13} className={cn('shrink-0 text-text-secondary transition-transform', !open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && <motion.div role="dialog" aria-label={t('aiLab.picker.model')}
          initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: EASE_ENTER }}
          className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-64 max-w-[calc(100vw-48px)] origin-bottom rounded-2xl border border-mr-line bg-[var(--mr-overlay)] p-2 shadow-[var(--elev-3)] backdrop-blur-xl">
          <button type="button" onClick={() => { setOpen(false); openSettings('model'); }}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-mr-surface-subtle">
            <span className="min-w-0"><span className="block text-mr-label text-text-secondary">{t('aiLab.picker.byokModel')}</span>
              <span className="mt-0.5 block truncate text-mr-body text-text-primary">{modelLabel}</span></span>
            <ChevronRight size={16} className="shrink-0 text-text-secondary" />
          </button>
          <div className="my-2 h-px bg-mr-line" />
          <div className="flex items-center justify-between px-2">
            <span className="text-mr-overline text-text-secondary">{t('aiLab.picker.strengthLabel')}</span>
            <span className="text-mr-overline text-[var(--ink-sky)]">{strengthLabel}</span>
          </div>
          <StrengthSlider value={strength} onChange={setStrength} t={t} />
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}

function StrengthSlider({
  value,
  onChange,
  supported,
  t,
}: {
  value: Strength;
  onChange: (s: Strength) => void;
  /** 当前模型接受的档位；不在其中的刻度标暗，选了也会被换成就近档。 */
  supported?: readonly string[];
  t: (k: string) => string;
}) {
  const index = STRENGTHS.indexOf(value);
  const last = STRENGTHS.length - 1;
  const frac = index / last;
  const railRef = useRef<HTMLDivElement>(null);

  // Map a pointer x onto the inner rail (thumb travels between the dot stops) and
  // snap to the nearest discrete strength.
  const pickFromClientX = (clientX: number) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(STRENGTHS[Math.round(ratio * last)]);
  };

  return (
    <div className="px-2 pb-1.5 pt-2.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("aiLab.picker.strengthLabel")}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={t(`aiLab.picker.strength.${value}`)}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pickFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 0) pickFromClientX(e.clientX);
        }}
        onKeyDown={(e) => {
          if ((e.key === "ArrowLeft" || e.key === "ArrowDown") && index > 0) {
            e.preventDefault();
            onChange(STRENGTHS[index - 1]);
          } else if (
            (e.key === "ArrowRight" || e.key === "ArrowUp") &&
            index < last
          ) {
            e.preventDefault();
            onChange(STRENGTHS[index + 1]);
          }
        }}
        className="relative h-7 cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
      >
        {/* track */}
        <div className="absolute inset-x-0 top-1/2 h-6 -translate-y-1/2 rounded-full bg-mr-sunk dark:bg-mr-line" />
        {/* filled — from the left cap up to the thumb centre */}
        <div
          className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-full bg-[var(--fill-sky)] transition-[width] duration-200 ease-out dark:bg-sky-400"
          style={{ width: `calc(0.875rem + (100% - 1.75rem) * ${frac})` }}
        />
        {/* inner rail: dot stops + thumb centres live here (inset by the thumb radius) */}
        <div
          ref={railRef}
          className="pointer-events-none absolute inset-y-0 left-3.5 right-3.5"
        >
          {STRENGTHS.map((s, i) =>
            i === index ? null : (
              <span
                key={s}
                className={cn(
                  "absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-200",
                  i < index
                    ? "bg-[#fff]/70 dark:bg-white/70"
                    : "bg-[var(--mr-line-strong)] dark:bg-white/25",
                  effectiveEffort(s, supported) !== s && "opacity-30",
                )}
                style={{ left: `${(i / last) * 100}%` }}
              />
            ),
          )}
          {/* thumb */}
          <span
            className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#fff] shadow-[var(--elev-1)] ring-1 ring-[var(--border-mr-line)] transition-[left] duration-200 ease-out dark:bg-white dark:shadow-md dark:shadow-black/40 dark:ring-black/5"
            style={{ left: `${frac * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
