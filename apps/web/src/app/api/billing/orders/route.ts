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

/**
 * The buyer's own order history.
 *
 * The query string is forwarded so paging is decided upstream, where the row
 * limit and the ownership scope live. This route never sees whose orders they
 * are — `proxyBilling` passes the caller's token and the platform API scopes
 * the query to it.
 */
export async function GET(req: NextRequest) {
  const search = req.nextUrl.search;
  return proxyBilling(`/api/billing/orders${search}`);
}
