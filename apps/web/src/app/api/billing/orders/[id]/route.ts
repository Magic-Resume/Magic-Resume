import { proxyBilling } from '@/lib/extensions/billing-proxy';

/** Order status. Cheap by design — the return page polls it while waiting. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBilling(`/api/billing/orders/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}
