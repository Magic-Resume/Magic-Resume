'use client';

import { useEffect } from 'react';
import { isCloudMode } from '@/lib/config/app';

const PENDING_KEY = 'magic:pending-referral';

/**
 * 登录后认领暂存的邀请码。
 *
 * 扫码那一刻用户通常还没登录，`/i/{code}` 只把码存进 localStorage；这里在有身份之后
 * 补上那一步。中间隔着一整段 Clerk 流程（注册 → 验证 → 回跳），任何一次跳转都会丢掉
 * URL 参数，所以归因不能依赖 query string 一路传递。
 *
 * 认领**不发奖**：奖励要等这个人真的用过一次。所以这里成不成功都无需给用户任何反馈
 * ——他此刻还没得到东西，弹一个「认领成功」只会让人以为已经到账了。
 *
 * 不收登录态参数：它挂在 dashboard layout 下，而那层服务端组件已经守住了未登录与
 * 未过 beta 闸门的情况——到这儿"已登录"是既成事实，再传一个 prop 只是把同一个保证
 * 复述一遍。
 */
export default function ReferralClaimer() {
  useEffect(() => {
    if (!isCloudMode) return;
    let code: string | null = null;
    try {
      code = window.localStorage.getItem(PENDING_KEY);
    } catch {
      return;
    }
    if (!code) return;

    // 先清再发：认领是幂等的（服务端靠 inviteeId 唯一列挡重复），而留着这个码会让
    // 每次刷新都重发一次请求。
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      // ignore
    }
    void fetch('/api/billing/referrals/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => undefined);
  }, []);

  return null;
}
