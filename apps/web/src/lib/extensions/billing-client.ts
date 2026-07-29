'use client';

import type {
  Entitlement,
  OrderCheckout,
  OrderSummary,
  PlanSummary,
  SubscriptionSummary,
} from '@/lib/billing/types';

/**
 * Billing slot — the open-source build has none.
 *
 * `next-config-overlay.mjs` aliases this module to the commercial billing
 * package, which talks to the platform API. Here it answers as a build with no
 * paywall: no plans to sell, no subscription to manage, and AI that runs on the
 * user's own API key.
 *
 * Unlike the analytics slot next door, these cannot be no-ops. Callers read the
 * returned entitlement and the hook's `{ data, loading, error, refresh }`, so
 * the stub has to return the real shapes — just with values that say "not
 * applicable" rather than "unknown".
 */

/**
 * `byok_required` is the honest answer for a self-hosted build, and it is also
 * the one that produces the right behaviour: `resolveAiAccessConfig` reads
 * `canUseInternal` and lands on "configure your own API key" instead of the
 * "entitlement check failed" error it would surface if this threw.
 */
/** Matches the convention in `app-lifecycle.ts`: consume a parameter the stub has no use for. */
const ignore = <T,>(value: T) => {
  void value;
};

const SELF_HOSTED_ENTITLEMENT: Entitlement = {
  mode: 'byok_required',
  canUseInternal: false,
  reason: 'self_hosted',
  currentPlan: null,
  remainingPercent: null,
};

export async function fetchPlans(): Promise<PlanSummary[]> {
  return [];
}

export async function fetchSubscription(): Promise<SubscriptionSummary | null> {
  return null;
}

export async function createSubscription(planId: string): Promise<string | null> {
  ignore(planId);
  return null;
}

export async function cancelSubscription(): Promise<void> {
  // Nothing to cancel.
}

/**
 * Credit packs are a cloud-only concept: a self-hosted build has no channel to
 * charge through and no wallet to credit. These return "no such thing" rather
 * than throwing, matching how the plan/subscription stubs above answer.
 */
export async function createOrder(
  planId: string,
  channel: string,
): Promise<OrderCheckout | null> {
  ignore(planId);
  ignore(channel);
  return null;
}

export async function fetchOrder(orderId: string): Promise<OrderSummary | null> {
  ignore(orderId);
  return null;
}

export async function syncOrder(orderId: string): Promise<OrderSummary | null> {
  ignore(orderId);
  return null;
}

export function peekEntitlement(): Entitlement | null {
  return SELF_HOSTED_ENTITLEMENT;
}

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
