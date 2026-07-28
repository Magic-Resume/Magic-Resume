import { NextResponse } from 'next/server';

/**
 * Billing passthrough slot — the open-source build has no billing backend.
 *
 * `next-config-overlay.mjs` aliases this module to the commercial billing
 * package, which forwards the caller's token to the platform API. The routes
 * under `app/api/billing/` stay in the open-source tree and call this, so a
 * self-hosted deployment answers them with a plain 404 instead of the route
 * disappearing at build time or failing on a missing upstream.
 */
export async function proxyBilling(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  void path;
  void init;
  return NextResponse.json(
    { error: 'Billing is not available in this build' },
    { status: 404 },
  );
}
