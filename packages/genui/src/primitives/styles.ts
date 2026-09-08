/**
 * Surfaces shared by every field control, so a card built from mixed controls
 * still reads as one card. All semantic tokens — the consuming app defines
 * them, and that is what makes these follow the light/dark theme.
 */
export const FIELD_SURFACE =
  'w-full bg-mr-sunk border border-mr-line rounded-xl text-sm text-mr-ink placeholder:text-mr-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-mr-accent/40';

export const FIELD_LABEL = 'block text-mr-label text-mr-muted mb-1.5';

/** Base chip: the resting state. Selection is layered on top, not swapped in. */
export const CHIP_BASE =
  'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors cursor-pointer';

export const CHIP_IDLE = 'bg-mr-sunk text-mr-ink-secondary hover:text-mr-ink';

export const CHIP_SELECTED = 'bg-mr-accent-tint text-mr-accent';
