import { NextRequest } from 'next/server';
import { proxyBilling } from '@/lib/extensions/billing-proxy';

/**
 * Create a subscription → returns the payment provider's approval URL.
 *
 * The body is forwarded untouched; which provider and plan shape it carries is
 * the commercial build's business, not this one's.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyBilling('/api/billing/subscriptions', { method: 'POST', body });
}
