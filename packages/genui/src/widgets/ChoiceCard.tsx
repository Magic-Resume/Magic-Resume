'use client';

import React, { useRef, useState } from 'react';
import { CornerDownLeft, MessageCircleQuestion } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@magic-resume/utils';
import { WidgetItem, WidgetShell } from '../motion';
import { CHIP_BASE, CHIP_IDLE, FIELD_SURFACE } from '../primitives';
import type { WidgetOption, WidgetProps } from '../contract';

/**
 * A question answered in one tap.
 *
 * This is the cheapest card in the set and the one that removes the most
 * typing: most of what the assistant asks mid-flow — improve this résumé or
 * start fresh? add another project? — is a choice between two or three things,
 * and today every one of those costs the user a sentence.
 *
 * There is always a way out to free text: the options are a shortcut, not the
 * only permitted answers.
 */
export default function ChoiceCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as {
    message?: string;
    options?: WidgetOption[];
    allowFreeText?: boolean;
  };
  const options = props.options ?? [];
  const resolved = instance.status !== 'pending';
  const [freeText, setFreeText] = useState('');
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picked, setPicked] = useState('');

  const choose = (value: string) => {
    if (!value.trim()) return;
    setPicked(value);
    onAction({ type: 'submit', values: { choice: value } });
  };

  return (
    <WidgetShell className="min-w-[280px] max-w-md flex-1 rounded-2xl bg-mr-surface px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-mr-accent-tint">
          <MessageCircleQuestion size={14} className="text-mr-accent" />
        </div>
        <span className="text-mr-caption text-mr-ink leading-snug">{props.message}</span>
      </div>

      {resolved ? (
        <div className="mt-2 text-xs text-mr-ink-secondary">
          {instance.status !== 'submitted'
            ? t(`aiLab.widgets.form.${instance.status}`)
            : // `picked` is component state, so a transcript restored from
              // storage has lost it — say "answered" rather than mislabelling
              // a submitted card as cancelled.
              picked || t('aiLab.widgets.form.submitted')}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {options.map((o) => (
              <WidgetItem key={o.value}>
                <button
                  type="button"
                  onClick={() => choose(o.value)}
                  className={cn(CHIP_BASE, CHIP_IDLE, 'hover:bg-mr-accent-tint hover:text-mr-accent')}
                >
                  {o.label}
                </button>
              </WidgetItem>
            ))}
            {props.allowFreeText && !typing && (
              <WidgetItem>
                <button
                  type="button"
                  onClick={() => {
                    setTyping(true);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className={cn(CHIP_BASE, CHIP_IDLE)}
                >
                  {t('aiLab.widgets.field.other')}
                </button>
              </WidgetItem>
            )}
          </div>

          {props.allowFreeText && typing && (
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => {
                  // Pinyin candidates commit with Enter too; without this the
                  // first word the user picks would send the whole answer.
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    choose(freeText);
                  }
                }}
                className={cn(FIELD_SURFACE, 'h-9 px-3')}
              />
              <button
                type="button"
                onClick={() => choose(freeText)}
                disabled={!freeText.trim()}
                className={cn(
                  'shrink-0 rounded-lg p-2 transition-colors',
                  freeText.trim()
                    ? 'bg-mr-accent text-mr-accent-ink cursor-pointer'
                    : 'bg-mr-sunk text-mr-muted cursor-not-allowed',
                )}
              >
                <CornerDownLeft size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </WidgetShell>
  );
}
