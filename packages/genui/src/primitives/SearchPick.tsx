'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@magic-resume/utils';
import { useGenUISource } from '../host/GenUIProvider';
import type { WidgetOption } from '../contract';
import { FIELD_SURFACE } from './styles';
import { Popover } from './Popover';

const MAX_VISIBLE = 40;

/** Prefix hits before substring hits; otherwise keep the source's own order. */
function defaultSearch(query: string, all: WidgetOption[]): WidgetOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  const prefix: WidgetOption[] = [];
  const contains: WidgetOption[] = [];
  for (const o of all) {
    const hay = `${o.label} ${o.value} ${o.hint ?? ''}`.toLowerCase();
    if (hay.startsWith(q)) prefix.push(o);
    else if (hay.includes(q)) contains.push(o);
  }
  return [...prefix, ...contains];
}

/**
 * Type-ahead over a registered data source, resolved entirely in the browser.
 *
 * Filtering never goes near the agent: a round trip per keystroke would cost
 * latency and tokens for something a substring match answers instantly. Only
 * the finished card submission travels back.
 *
 * The source is advisory, not a whitelist — whatever the user types stands, so
 * a school or company missing from the dictionary is never a dead end.
 */
export function SearchPick({
  value,
  onChange,
  source,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  source?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const dataSource = useGenUISource(source);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<WidgetOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Load on first interaction, not on mount: a card with three search fields
  // would otherwise pull three dictionaries the user may never open.
  const ensureLoaded = useCallback(() => {
    if (!dataSource || all || loading) return;
    setLoading(true);
    void dataSource
      .load()
      .then(setAll)
      .catch(() => setAll([])) // a failed dictionary degrades to plain typing
      .finally(() => setLoading(false));
  }, [dataSource, all, loading]);

  const matches = useMemo(() => {
    if (!all) return [];
    const run = dataSource?.search ?? defaultSearch;
    return run(value, all).slice(0, MAX_VISIBLE);
  }, [all, dataSource, value]);

  useEffect(() => setHighlight(0), [value]);

  const commit = (option: WidgetOption) => {
    onChange(option.value);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Pinyin composition sends Enter to accept a candidate; without this guard
    // that Enter also picks whatever row happens to be highlighted.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (!open || !matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(matches[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(FIELD_SURFACE, 'h-9 px-3')}
        autoComplete="off"
      />
      <Popover anchorRef={inputRef} open={open && Boolean(dataSource)} onClose={() => setOpen(false)}>
        <div className="max-h-60 overflow-y-auto rounded-xl bg-overlay border border-hairline backdrop-blur py-1 shadow-lg">
          {loading && (
            <div className="ai-breath--soft px-3 py-2 space-y-2">
              <div className="h-3 w-2/3 rounded bg-sunk" />
              <div className="h-3 w-1/2 rounded bg-sunk" />
            </div>
          )}
          {!loading && !matches.length && (
            <div className="px-3 py-2 text-xs text-muted">
              {t('aiLab.widgets.field.noMatch')}
            </div>
          )}
          {matches.map((o, i) => (
            <button
              key={o.value}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(o)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm cursor-pointer',
                i === highlight ? 'bg-tint-sky text-ink-sky' : 'text-primary',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && <span className="ml-auto shrink-0 text-[11px] text-muted">{o.hint}</span>}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
