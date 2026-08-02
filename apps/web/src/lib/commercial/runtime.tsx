import type { ReactNode } from 'react';

/**
 * Commercial runtime slot. In the open-source build this is a no-op passthrough.
 * The commercial build replaces this module wholesale (Magic-Resume-Commercial
 * `scripts/apply-overlay.mjs` rewrites it into a re-export of the analytics
 * runtime provider), so the target owns analytics init + SPA page-view
 * tracking. A `next.config.ts` webpack slot covers the same specifier for
 * builds that do not run the rewrite.
 *
 * NOTE: the `window.__ENV` runtime-env injection deliberately lives in the
 * sibling `./runtime-env` module (NOT here) because the overlay replaces this
 * one — see runtime-env.tsx for the full rationale.
 */
export function CommercialRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
