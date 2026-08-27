'use client';

import React from 'react';
import { Check } from '@magic-resume/icons';
import { cn } from '@magic-resume/utils';
import { WidgetItem } from '../motion';
import type { WidgetOption } from '../contract';

/**
 * A grid of selectable tiles, for choices you pick by looking rather than by
 * reading — a template, a colour, a typeface.
 *
 * Renders no tile content itself: what a tile *looks* like is domain knowledge
 * (a résumé template preview, a swatch), so the consumer passes `renderTile`.
 * This keeps the grid, selection state, keyboard semantics and the selected
 * treatment in one place without the package needing to know what is being
 * chosen.
 */
export function Gallery({
  options,
  value,
  onChange,
  renderTile,
  columns = 3,
}: {
  options: WidgetOption[];
  value: string;
  onChange: (next: string) => void;
  renderTile: (option: WidgetOption, selected: boolean) => React.ReactNode;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <WidgetItem key={o.value}>
            <button
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={selected}
              title={o.label}
              className={cn(
                'group relative w-full overflow-hidden rounded-lg transition-colors cursor-pointer',
                selected ? 'ring-2 ring-ink-sky' : 'ring-1 ring-hairline hover:ring-strong',
              )}
            >
              {renderTile(o, selected)}
              {selected && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-fill-sky text-on-fill-sky">
                  <Check size={11} strokeWidth={3} />
                </span>
              )}
              <span className="block truncate px-1.5 py-1 text-left text-[11px] text-secondary">
                {o.label}
              </span>
            </button>
          </WidgetItem>
        );
      })}
    </div>
  );
}
