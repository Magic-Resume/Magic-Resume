'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@magic-resume/utils';
import { Popover } from './Popover';
import { FIELD_SURFACE } from './styles';

/**
 * A small styled dropdown.
 *
 * Exists because a native `<select>` inside a designed card opens the OS menu —
 * a light popup with the system highlight colour, which lands in the middle of
 * a dark workstation like a hole. It also renders as an empty box when nothing
 * is picked yet, so the user can't tell what it's for.
 */
export function MiniSelect({
  value,
  options,
  placeholder,
  disabled,
  ariaLabel,
  onChange,
  widthClass = 'w-[86px]',
}: {
  value: string;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (next: string) => void;
  widthClass?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) return;
    const i = options.indexOf(value);
    setHighlight(i >= 0 ? i : 0);
  }, [open, options, value]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          FIELD_SURFACE,
          widthClass,
          'h-9 px-2.5 inline-flex items-center justify-between gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <span className={cn('truncate', !value && 'text-muted')}>{value || placeholder}</span>
        <ChevronDown size={13} className="shrink-0 text-muted" />
      </button>

      <Popover anchorRef={triggerRef} open={open && !disabled} onClose={() => setOpen(false)}>
        <div
          role="listbox"
          className="max-h-56 overflow-y-auto rounded-xl border border-hairline bg-overlay py-1 shadow-lg backdrop-blur"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => (h + 1) % options.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => (h - 1 + options.length) % options.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commit(options[highlight]);
            }
          }}
        >
          {options.map((o, i) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => commit(o)}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-sm cursor-pointer',
                i === highlight ? 'bg-tint-sky text-ink-sky' : 'text-primary',
              )}
            >
              {o}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
