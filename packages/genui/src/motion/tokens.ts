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

/**
 * 曲线本身已经不住在这里了——它们是全项目共用的，收在 `@magic-resume/utils`
 * （`motion.ts`），CSS 侧对应 `--narrate-ease` / `--exit-ease`。这里转出去，
 * 是为了让 genui 已有的引用点不用改。
 */
export { EASE_ENTER, EASE_EXIT, EASE_STATE, EASE_OVERSHOOT } from '@magic-resume/utils';

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
