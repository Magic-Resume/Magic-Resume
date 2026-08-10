/**
 * Motion tokens for GenUI cards.
 *
 * These are the JS half of a pair: the consuming app declares the same values
 * as CSS custom properties (`--widget-enter`, `--stagger-step`, `--narrate-ease`,
 * …) for its CSS-driven animation, and framer-motion reads them from here.
 * Change one, change the other.
 *
 * The vocabulary is not new — it plugs into the app's existing "one heartbeat"
 * motion language (docs/specs/ai-working-motion): a single entering curve, a
 * single exiting curve, and durations budgeted by how much the moment matters.
 * No spring, no bounce, no elastic; transform and opacity only.
 */

/** The one "entering / expanding" curve. Mirrors `--narrate-ease`. */
export const EASE_ENTER: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** The one "leaving" curve. Mirrors `--exit-ease`. */
export const EASE_EXIT: [number, number, number, number] = [0.4, 0, 1, 1];

/** Seconds, because that is what framer-motion wants. */
export const DURATION = {
  /** L0 — hover / press / focus. Opacity and a pixel or two. */
  micro: 0.12,
  /** L1 — chips appearing, a field expanding. Mirrors `--narrate-duration`. */
  element: 0.18,
  /** L2 — a card entering. Mirrors `--widget-enter`. */
  card: 0.24,
  /** L2 — a card collapsing into its resolved summary. Mirrors `--widget-settle`. */
  settle: 0.32,
  /** L3 — the stage: canvas opening, a section taking shape. */
  stage: 0.42,
} as const;

/**
 * Gap between staggered children. Small on purpose: enough to read as "the
 * options are being laid out for you", not enough to feel like waiting.
 */
export const STAGGER_STEP = 0.03;

/** How far a card travels on entry, in px. */
export const ENTER_OFFSET = 8;
