'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@magic-resume/utils';
import { DURATION, EASE_ENTER } from '../motion';
import type { WidgetOption } from '../contract';
import { CHIP_BASE, CHIP_IDLE, CHIP_SELECTED, FIELD_SURFACE } from './styles';

/**
 * The selected ring, swept out from the centre rather than switched on.
 * Selection is the one place in a card where the user's own action is being
 * echoed, so it earns a little motion — 120ms, transform only.
 */
function SelectionRing({ show }: { show: boolean }) {
  const reduce = useReducedMotion() ?? false;
  if (!show) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-ink-sky/50"
      initial={reduce ? false : { scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: reduce ? 0 : DURATION.micro, ease: EASE_ENTER }}
    />
  );
}

function Chip({
  option,
  selected,
  onClick,
}: {
  option: WidgetOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(CHIP_BASE, selected ? CHIP_SELECTED : CHIP_IDLE)}
    >
      <SelectionRing show={selected} />
      {option.label}
    </button>
  );
}

/**
 * The escape hatch every chip row needs: the list is a starting point, never a
 * fence (`.impeccable.md` principle 5). Opening it is one tap, and what the
 * user types becomes the value as-is.
 */
function CustomEntry({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => Boolean(value));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(CHIP_BASE, CHIP_IDLE)}
      >
        <Plus size={12} />
        {t('aiLab.widgets.field.other')}
      </button>
    );
  }
  return (
    <input
      type="text"
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(FIELD_SURFACE, 'h-8 px-3 text-xs w-40 rounded-full')}
    />
  );
}

/** Single choice. Tapping the selected chip clears it when the field is optional. */
export function Chips({
  options,
  value,
  onChange,
  allowCustom,
  clearable,
  placeholder,
}: {
  options: WidgetOption[];
  value: string;
  onChange: (next: string) => void;
  allowCustom?: boolean;
  clearable?: boolean;
  placeholder?: string;
}) {
  const known = options.some((o) => o.value === value);
  const custom = !known ? value : '';

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip
          key={o.value}
          option={o}
          selected={o.value === value}
          onClick={() => onChange(clearable && o.value === value ? '' : o.value)}
        />
      ))}
      {allowCustom && (
        <CustomEntry value={custom} placeholder={placeholder} onChange={onChange} />
      )}
    </div>
  );
}

/** Multi choice. The value is the picked labels joined by `, ` — the agent reads it as prose. */
export function MultiChips({
  options,
  value,
  onChange,
  allowCustom,
  placeholder,
}: {
  options: WidgetOption[];
  value: string;
  onChange: (next: string) => void;
  allowCustom?: boolean;
  placeholder?: string;
}) {
  const picked = value ? value.split(', ').filter(Boolean) : [];
  const known = new Set(options.map((o) => o.value));
  const custom = picked.filter((p) => !known.has(p)).join(', ');

  const toggle = (v: string) => {
    const next = picked.includes(v) ? picked.filter((p) => p !== v) : [...picked, v];
    onChange(next.join(', '));
  };

  const setCustom = (raw: string) => {
    const kept = picked.filter((p) => known.has(p));
    const added = raw
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
    onChange([...kept, ...added].join(', '));
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Chip
          key={o.value}
          option={o}
          selected={picked.includes(o.value)}
          onClick={() => toggle(o.value)}
        />
      ))}
      {allowCustom && (
        <CustomEntry value={custom} placeholder={placeholder} onChange={setCustom} />
      )}
    </div>
  );
}
