'use client';

import type { Entitlement } from '@/lib/billing/types';

/**
 * Billing slot — the open-source build has none.
 *
 * The commercial build replaces this module with the commercial billing
 * package, which talks to the platform API. Here it answers as a build with no
 * paywall: AI runs on the user's own API key.
 *
 * The contract is only what the app itself asks: the entitlement, which
 * decides between built-in AI and bring-your-own-key. Plans, orders and
 * subscriptions are read by the surfaces that render them, and those live in
 * the commercial package (see `billing-ui` / `growth`), so they are not part of
 * this slot. A smaller contract is one the overlay cannot fall behind on.
 *
 * Unlike the analytics slot, these cannot be no-ops. Callers read the returned
 * entitlement and the hook's `{ data, loading, error, refresh }`, so the stub
 * has to return the real shapes — just with values that say "not applicable"
 * rather than "unknown".
 */

/** Matches the convention in `app-lifecycle.ts`: consume a parameter the stub has no use for. */
const ignore = <T,>(value: T) => {
  void value;
};

/**
 * `byok_required` is the honest answer for a self-hosted build, and it is also
 * the one that produces the right behaviour: `resolveAiAccessConfig` reads
 * `canUseInternal` and lands on "configure your own API key" instead of the
 * "entitlement check failed" error it would surface if this threw.
 */
const SELF_HOSTED_ENTITLEMENT: Entitlement = {
  mode: 'byok_required',
  canUseInternal: false,
  reason: 'self_hosted',
  currentPlan: null,
  remainingPercent: null,
  // Nothing was ever paid here, so there is no channel to prefer.
  lastPaidChannel: null,
};

export function invalidateEntitlementCache(): void {
  // Nothing is cached; the answer is constant.
}

export async function fetchEntitlement(
  options: { force?: boolean } = {},
): Promise<Entitlement> {
  ignore(options);
  return SELF_HOSTED_ENTITLEMENT;
}

/** Mirrors the commercial hook's shape so callers need no branching. */
export function useEntitlement(enabled = true) {
  ignore(enabled);
  return {
    data: SELF_HOSTED_ENTITLEMENT,
    loading: false,
    error: null as string | null,
    refresh: async () => {},
  };
}
