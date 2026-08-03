import { proxyBilling } from '@/lib/extensions/billing-proxy';

/**
 * Ask the payment channel directly whether this order was paid.
 *
 * Separate from the GET above because it makes an upstream call: the return
 * page polls the cheap endpoint and reaches for this one only when a
 * notification looks like it went missing.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyBilling(`/api/billing/orders/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
  });
}
