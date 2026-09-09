'use client';

import { useEffect } from 'react';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

/**
 * `window.onerror` 与 `unhandledrejection` 的汇聚点。
 *
 * 这两个此前**一个都没有挂**。React 边界只接得住渲染期的崩溃；事件回调里抛的异常、
 * 没有 `.catch()` 的 promise、第三方脚本的报错，全部只在用户自己的控制台里闪一下——
 * 也就是说，最难复现的那类故障，恰好是我们唯一收不到的那类。
 *
 * 只上报，不弹提示：到得了这里的东西通常已经有别的地方在处理，再弹一层只会重复打扰。
 */
export function GlobalErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('[window.onerror]', event.message, event.error);
      appLifecycle.reactErrorCaught({
        message: event.message || 'Unhandled error',
        name: (event.error as Error | undefined)?.name,
        stack: (event.error as Error | undefined)?.stack,
        component: 'window',
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as unknown;
      // 用户点了停止/关了弹窗会走到这里，那不是故障。
      if ((reason as { name?: string })?.name === 'AbortError') return;
      console.error('[unhandledrejection]', reason);
      appLifecycle.reactErrorCaught({
        message:
          reason instanceof Error ? reason.message : String(reason ?? 'unknown'),
        name: reason instanceof Error ? reason.name : 'UnhandledRejection',
        stack: reason instanceof Error ? reason.stack : undefined,
        component: 'promise',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
