import { proxyBilling } from '@/lib/extensions/billing-proxy';

/**
 * The signed-in user's AI entitlement and remaining allowance.
 *
 * This used to carry its own copy of the auth check, envelope unwrapping and
 * error handling — the same logic `proxyBilling` performs, written out inline
 * before the shared helper existed. Going through the slot keeps every billing
 * route on one path, so a build without billing answers them all the same way.
 */
export function GET() {
  return proxyBilling('/api/billing/ai-entitlement', { method: 'GET' });
}
