/** Frontend mirror of the platform-api billing shapes (JSON-serialized). */

export type PlanKind = 'credit_pack' | 'subscription';

/**
 * What one channel charges for a plan.
 *
 * This — not `PlanSummary.priceCents` — is the number to show once a channel is
 * picked. The plan-level price is a base list price and may be denominated in a
 * currency this buyer will never be charged in (¥19 domestically vs $2.90
 * overseas are two offers on one plan, not two plans).
 *
 * `channel` stays an unconstrained string here, as it is elsewhere in this file:
 * a self-hosted build has no business knowing which payment providers exist.
 * The commercial overlay narrows it.
 */
export interface PlanOffer {
  channel: string;
  priceCents: number;
  currency: string;
}

/**
 * Icons a feature row may use, mapped to components by whoever renders the card.
 *
 * A closed set rather than a free Lucide name: `optimizePackageImports` rewrites
 * barrel imports to deep paths at build time, so a name chosen at runtime either
 * drags every icon into the bundle or renders nothing at all.
 */
export type PlanFeatureIcon =
  | 'sparkles'
  | 'zap'
  | 'calendar'
  | 'shield'
  | 'infinity'
  | 'gauge'
  | 'check';

export interface PlanFeatureRow {
  icon: PlanFeatureIcon;
  /**
   * May contain `{{dailyLimit}}`, `{{weeklyLimit}}` or `{{modelCount}}`, which
   * the renderer fills from the plan itself. Operators write the wording; the
   * numbers stay authoritative, so a bullet cannot claim a limit the runtime
   * will contradict.
   */
  text: string;
}

export interface PlanCardCopy {
  /** Shown instead of `name` on the pricing card only — `name` has no language. */
  displayName?: string;
  tagline?: string;
  /** Replaces the default badge wording on whichever card is `highlighted`. */
  badge?: string;
  features?: PlanFeatureRow[];
}

export interface PlanSummary {
  id: string;
  name: string;
  kind: PlanKind;
  priceCents: number;
  currency: string;
  modelAllowlist: string[];
  dailyLimit: number;
  weeklyLimit: number;
  interval?: string | null;
  isDefault: boolean;
  /**
   * Requests per minute this plan allows.
   *
   * The one field that genuinely separates the tiers. Without it the card had
   * nothing to show for the price: allowances never leave the server, and the
   * day/week caps are zero on every plan, so a paid tier and the free one
   * rendered word-for-word identically.
   */
  rateLimitRpm: number;
  /** Whether this card wears the "popular" badge. */
  highlighted?: boolean;
  /**
   * Operator-written card copy, keyed by locale (`zh` / `en`).
   *
   * Every locale arrives at once rather than being negotiated: language here is
   * a client-side runtime switch, and a server-negotiated payload would go stale
   * the moment somebody changes language with the modal open.
   *
   * Absent means nothing is configured and the renderer falls back to its
   * built-in block — never an empty object standing for "configured but blank".
   */
  copy?: Record<string, PlanCardCopy>;
  /**
   * Present on the plan list; absent where the API returns "which plan am I on"
   * (entitlement, subscription.plan) rather than a catalogue. Absent means "not
   * loaded" — it is never an empty array standing for "sold nowhere".
   */
  offers?: PlanOffer[];
  // `includedCredits` intentionally omitted: credits are the internal billing
  // unit and are never sent to the client — the API exposes only a percentage.
}

/**
 * A one-off credit-pack purchase. `credits` is a string because it is a BigInt
 * server-side and would lose precision as a JSON number.
 */
export interface OrderSummary {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  credits: string;
  paidAt?: string | null;
}

/** What the server hands back when an order is created and needs paying. */
export interface OrderCheckout {
  orderId: string;
  /** `redirect` → send the browser to payUrl; `qrcode` → render payUrl as a QR. */
  kind: 'redirect' | 'qrcode';
  payUrl: string;
}

export interface SubscriptionSummary {
  id: string;
  planId: string;
  status: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  plan?: PlanSummary | null;
}

export interface UsageSummary {
  dailyUsed: number;
  weeklyUsed: number;
  dailyLimit: number;
  weeklyLimit: number;
  dailyResetAt: string;
  weeklyResetAt: string;
}

/**
 * Response of GET /api/billing/ai-entitlement. Credit-free by design: the client
 * only learns the plan type, whether internal AI is usable right now
 * (`canUseInternal` + `reason`), and how much of the monthly allowance is left
 * (`remainingPercent`). Raw credit balances/caps and day/week counts never leave
 * the server (credits are our internal billing unit).
 */
export interface Entitlement {
  mode: 'internal' | 'byok_required';
  /** Whether internal AI can be used right now (credits + day/week caps). */
  canUseInternal: boolean;
  reason?: string | null;
  /** 计划类型 — no credit fields. */
  currentPlan: PlanSummary | null;
  /** 还剩百分之多少 (0-100) of the monthly allowance; null = unlimited. */
  remainingPercent: number | null;
  /** When the monthly allowance refreshes (ISO). */
  resetAt?: string | null;
  /** Supported models the composer can offer for internal runs (allowlist-filtered). */
  availableModels?: string[];
  /**
   * The channel of this user's last successful payment, or null.
   *
   * A UX default for the channel selector and nothing else — the server prices
   * an order from `(planId, channel)` and has no notion of regions. `manual`
   * (off-platform bookkeeping) is never reported: there is no cashier behind it.
   */
  lastPaidChannel?: string | null;
}
