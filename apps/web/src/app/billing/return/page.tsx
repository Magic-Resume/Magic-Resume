'use client';

import { Suspense } from 'react';
import { BillingReturnPage } from '@/lib/extensions/billing-ui';

/**
 * Route shell for the payment channel's `return_url`. The slot decides what it
 * renders — an open-source build has no orders and gets nothing.
 *
 * `Suspense` because the slot reads `useSearchParams`; without a boundary
 * `next build` fails prerendering this route (same as `billing/checkout`).
 */
export default function BillingReturnRoute() {
  return (
    <Suspense fallback={null}>
      <BillingReturnPage />
    </Suspense>
  );
}
