'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@magic-resume/utils';
import { DURATION, EASE_ENTER } from '../motion';
import type { WidgetOption } from '../contract';

/**
 * A short mutually-exclusive scale (fresh grad → 5 years+). Chips would work,
 * but a segmented track says "these are the rungs of one ladder", which is the
 * thing being asked. The moving indicator is a shared layout animation, so the
 * highlight slides between rungs instead of blinking out and in.
 */
export function Segmented({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: WidgetOption[];
  value: string;
  onChange: (next: string) => void;
  /** unique per field — two segmented fields in one card must not share it. */
  layoutId: string;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <div className="inline-flex rounded-xl bg-mr-sunk border border-mr-line p-0.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            className={cn(
              'relative rounded-mr-card px-3 py-1.5 text-xs transition-colors cursor-pointer',
              selected ? 'text-mr-accent' : 'text-mr-ink-secondary hover:text-mr-ink',
            )}
          >
            {selected && (
              <motion.span
                aria-hidden
                layoutId={reduce ? undefined : layoutId}
                className="absolute inset-0 rounded-mr-card bg-mr-accent-tint"
                transition={{ duration: DURATION.element, ease: EASE_ENTER }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
