'use client';

import { Suspense } from 'react';
import { CheckoutPage } from '@/lib/extensions/billing-ui';

/**
 * Route shell for the checkout stop-over. The slot decides what it renders —
 * an open-source build has nothing to sell and gets nothing.
 *
 * `Suspense` is not optional: the slot reads `useSearchParams`, and without a
 * boundary `next build` fails prerendering this route — the same trap
 * `billing/return/page.tsx` documents.
 */
export default function BillingCheckoutRoute() {
  return (
    <Suspense fallback={null}>
      <CheckoutPage />
    </Suspense>
  );
}
