import { NextRequest } from 'next/server';
import { proxyBilling } from '@/lib/extensions/billing-proxy';

/**
 * Create a credit-pack order → returns the payment channel's checkout URL.
 *
 * The body is forwarded untouched; which channel and plan it names is the
 * commercial build's business, not this one's.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyBilling('/api/billing/orders', { method: 'POST', body });
}
