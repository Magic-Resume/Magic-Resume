import { proxyBilling } from '@/lib/extensions/billing-proxy';

/**
 * 认领一个邀请码。注册后带着 `?ref=` 里的码调一次。
 *
 * 认领**不发奖**——奖励要等被邀请人真的用过一次，否则一个邮箱就能换一笔额度。
 */
export async function POST(request: Request) {
  const body = await request.text();
  return proxyBilling('/api/billing/referrals/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
