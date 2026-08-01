'use client';

import React, { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { SECTION_ICON_NAMES, sectionIconByName } from '@magic-resume/resume-templates';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  /** Present when editing; absent when creating. */
  initial?: { label: string; icon?: string };
  onSubmit: (value: { label: string; icon?: string }) => void;
  onOpenChange: (open: boolean) => void;
};

/**
 * Create or retitle a custom section.
 *
 * One dialog for both because the two differ only in their starting values —
 * a separate "rename" surface would be the same three controls with a
 * different heading, and would drift.
 *
 * The icon is optional on purpose. Left unset, the renderer still picks one by
 * matching keywords in the title (`getSectionIcon`), which is right far more
 * often than not — so the picker offers to override a good guess rather than
 * demanding a decision before the section can exist.
 */
export default function CustomSectionDialog({
  open,
  initial,
  onSubmit,
  onOpenChange,
}: Props) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);

  // Reset on each open so a cancelled edit does not leak into the next one.
  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? '');
    setIcon(initial?.icon);
  }, [open, initial?.label, initial?.icon]);

  const trimmed = label.trim();
  const submit = () => {
    if (!trimmed) return;
    onSubmit({ label: trimmed, icon });
    onOpenChange(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl">
          <DialogPrimitive.Title className="text-[15px] font-semibold text-neutral-100">
            {initial
              ? t('customSection.renameTitle', { defaultValue: '重命名模块' })
              : t('customSection.createTitle', { defaultValue: '添加自定义模块' })}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-[12px] text-neutral-500">
            {t('customSection.hint', {
              defaultValue: '模块标题会原样显示在简历上。',
            })}
          </DialogPrimitive.Description>

          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder={t('customSection.placeholder', {
              defaultValue: '例如：个人优势、获奖经历',
            })}
            className="mt-4 h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[13px] text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-sky-400/50"
          />

          <div className="mt-4">
            <div className="mb-2 text-[12px] text-neutral-500">
              {t('customSection.iconLabel', { defaultValue: '图标（可选）' })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SECTION_ICON_NAMES.map((name) => {
                const Icon = sectionIconByName(name);
                if (!Icon) return null;
                const active = icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={active}
                    // Clicking the active one clears it, so "let the app guess"
                    // stays reachable after a choice has been made.
                    onClick={() => setIcon(active ? undefined : name)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg border transition-colors duration-150',
                      active
                        ? 'border-sky-400/50 bg-sky-400/10 text-sky-300'
                        : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:text-neutral-100',
                    )}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <DialogPrimitive.Close className="h-8 rounded-lg border border-white/10 px-3 text-[13px] text-neutral-400 transition-colors hover:text-neutral-100">
              {t('common.cancel', { defaultValue: '取消' })}
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={submit}
              disabled={!trimmed}
              className="h-8 rounded-lg bg-sky-500 px-3 text-[13px] font-medium text-white transition-opacity disabled:opacity-40"
            >
              {t('common.confirm', { defaultValue: '确定' })}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
