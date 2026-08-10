/**
 * Surfaces shared by every field control, so a card built from mixed controls
 * still reads as one card. All semantic tokens — the consuming app defines
 * them, and that is what makes these follow the light/dark theme.
 */
export const FIELD_SURFACE =
  'w-full bg-sunk border border-hairline rounded-xl text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-ink-sky/40';

export const FIELD_LABEL = 'block text-[11px] text-muted mb-1.5';

/** Base chip: the resting state. Selection is layered on top, not swapped in. */
export const CHIP_BASE =
  'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer';

export const CHIP_IDLE = 'bg-sunk text-secondary hover:text-primary';

export const CHIP_SELECTED = 'bg-tint-sky text-ink-sky';
