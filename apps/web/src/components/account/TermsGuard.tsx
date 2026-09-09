'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppAuth } from '@/lib/auth';
import { isCloudMode } from '@/lib/config/app';
import { termsApi } from '@/lib/api/termsApi';
import {
  TERMS_VERSION,
  TermsReconsentDialog,
  takePendingConsent,
} from '@/components/auth/TermsGate';

/**
 * 登录之后，把条款同意这件事补齐。
 *
 * 它接的是登录页留下的那个时序缺口：勾选框先于登录发生，那一刻还没有用户行可写
 * （brief §10a）。所以意向暂存在 `sessionStorage`，由这里在有身份之后补写进库。
 *
 * 同一个组件顺带覆盖另外两种人——从没同意过的存量用户、条款改版后的所有人：
 * 服务端的 `required` 已经把三种情况归一了，前端不需要各判一次。
 *
 * **补写失败不拦人。** 拿同意记录去挡用户进门是本末倒置——他刚刚才勾过。失败就留到
 * 下次带鉴权的加载再试。只有服务端明确说「还需要同意」且本地没有待补写的意向时，
 * 才真的弹框。
 */
export default function TermsGuard() {
  const { signOut } = useAppAuth();
  const [ask, setAsk] = useState<{ reconsent: boolean } | null>(null);

  useEffect(() => {
    if (!isCloudMode) return;
    let cancelled = false;

    void (async () => {
      let status;
      try {
        status = await termsApi.status();
      } catch {
        // 问不到就什么都不做。网络抖一下就弹一个「请同意服务条款」，比不弹糟得多。
        return;
      }
      if (cancelled || !status.required) return;

      // 刚在登录页勾过的：直接补写，不打扰他。
      const pending = takePendingConsent();
      if (pending) {
        try {
          await termsApi.accept(pending);
          return;
        } catch {
          // 补写失败也不拦——下次加载还会走到这里。
          return;
        }
      }

      if (!cancelled) setAsk({ reconsent: status.reconsent });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const accept = useCallback(() => {
    void termsApi
      .accept(TERMS_VERSION)
      .then(() => setAsk(null))
      // 失败时也收起来：这不是一道安全边界（真正的边界在服务端），把人锁在一个
      // 点了没反应的框里只是把网络故障变成产品故障。下次加载会再问。
      .catch(() => setAsk(null));
  }, []);

  if (!ask) return null;
  return (
    <TermsReconsentDialog
      open
      reconsent={ask.reconsent}
      onAccept={accept}
      onSignOut={() => void signOut()}
    />
  );
}
