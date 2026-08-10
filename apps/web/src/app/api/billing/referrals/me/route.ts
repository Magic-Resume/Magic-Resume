import { proxyBilling } from '@/lib/extensions/billing-proxy';

/**
 * 当前用户的邀请概览：邀请码、已邀请人数、单次奖励相当于多少额度。
 *
 * 邀请码在服务端惰性生成——绝大多数用户永远不会点开邀请页，为一个未被使用的功能
 * 给全量存量用户预生成等于写一次全表。
 */
export function GET() {
  return proxyBilling('/api/billing/referrals/me', { method: 'GET' });
}
