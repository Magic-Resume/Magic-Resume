import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

/**
 * Legal-document slot — the open-source build ships no policies.
 *
 * The routes under `app/legal/` stay in this tree because the overlay cannot
 * add a route: its entire write surface is a fixed list of module paths, and
 * App Router discovers pages by scanning the filesystem. So the shells stay
 * here and only what they render moves — the same shape `app/api/billing/*`
 * already uses with `proxyBilling`.
 *
 * A self-hosted deployment 404s rather than rendering someone else's policy.
 * Whoever deployed it is the data controller: their users' resumes never reach
 * us, and serving OUR privacy policy there would be a false statement made on
 * their behalf. Nothing about the operating entity, its filings, or its refund
 * terms belongs in a repository anyone can fork.
 */
export type LegalDoc = 'terms' | 'privacy' | 'refund';
export type LegalLocale = 'zh' | 'en';

// `: never` is load-bearing. Without it TypeScript infers `void`, and a
// component returning void is not a valid JSX element type — the route shells
// would not compile. `notFound()` never returns, so this is the honest type.
export function LegalDocument(_props: {
  doc: LegalDoc;
  locale?: LegalLocale;
}): never {
  void _props;
  notFound();
}

/**
 * Neutral titles only. Metadata has to be exported by the route module itself,
 * so it cannot come from the component — which means this object exists even in
 * a build with no policies. It says nothing a policy would say.
 */
const NEUTRAL: Metadata = { title: 'Magic Resume', robots: { index: false } };

export const legalMetadata: Record<LegalDoc, Record<LegalLocale, Metadata>> = {
  terms: { zh: NEUTRAL, en: NEUTRAL },
  privacy: { zh: NEUTRAL, en: NEUTRAL },
  refund: { zh: NEUTRAL, en: NEUTRAL },
};

/**
 * Support address for the account menu's "report a bug" entry.
 *
 * `null` in this build: an inbox is a property of whoever operates a
 * deployment, not of the software. The menu item is hidden when it is null —
 * the same rule the help-centre link follows.
 */
export const SUPPORT_EMAIL: string | null = null;
