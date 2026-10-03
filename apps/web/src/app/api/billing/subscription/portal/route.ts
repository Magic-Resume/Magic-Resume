import { proxyBilling } from '@/lib/extensions/billing-proxy';

export async function POST() {
  return proxyBilling('/api/billing/subscription/portal', { method: 'POST' });
}
