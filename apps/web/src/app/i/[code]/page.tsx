'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** 认领意图的暂存位。用户扫码时多半还没登录，登录后才有身份可归因。 */
const PENDING_KEY = 'magic:pending-referral';

/**
 * 邀请落地页 `/i/{code}`。
 *
 * 它自己不渲染任何东西——扫码的人要的是「进产品」，而不是先读一页说明。这里只做两件
 * 事：把码存下来、把人送进 dashboard；登录闸门在路上自然会拦（`middleware.ts`）。
 *
 * **码存在 localStorage 而不是直接调认领接口**：扫码时用户通常尚未登录，此刻没有身份
 * 可归因。存下来，等他登录后由 `ReferralClaimer` 认领——注册与归因之间隔着一整段
 * Clerk 流程，中间任何一次跳转都会丢掉 URL 参数。
 */
export default function InviteLanding() {
  const router = useRouter();
  const params = useParams<{ code: string }>();

  useEffect(() => {
    const code = (params?.code ?? '').trim().toUpperCase();
    if (code) {
      try {
        window.localStorage.setItem(PENDING_KEY, code);
      } catch {
        // 隐私模式下存不下：归因会丢，但不该因此把人挡在门外。
      }
    }
    router.replace('/dashboard');
  }, [params, router]);

  return null;
}
