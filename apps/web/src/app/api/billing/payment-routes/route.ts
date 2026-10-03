import { proxyBilling } from '@/lib/extensions/billing-proxy';

export async function GET() {
  return proxyBilling('/api/billing/payment-routes');
}
