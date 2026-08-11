'use client';

import { useEffect } from 'react';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

/**
 * 根布局自己崩了的时候。
 *
 * `app/error.tsx` 接不住这一层——它在 layout 内部渲染，而 layout 已经不在了。此前这一档
 * 完全空缺：Provider 树（Clerk、i18n、主题）里任何一个抛异常，用户拿到的是一块纯白屏，
 * 而我们这边一个数都没有。
 *
 * 这里不能用 i18n、不能用设计系统组件——它们正是可能已经挂掉的东西。所以文案内联双语，
 * 样式内联，依赖只有 React 本身。丑一点没关系，能出现就是全部意义。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root layout crashed:', error);
    appLifecycle.reactErrorCaught({
      message: error.message,
      name: error.name,
      stack: error.stack,
      digest: error.digest,
      component: 'root',
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
          color: '#e5e5e5',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>
            页面加载失败{/* i18n-ignore */}
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: '#a3a3a3',
              margin: '0 0 8px',
            }}
          >
            出了点问题，我们已经收到告警。刷新一下通常就好了。{/* i18n-ignore */}
          </p>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: '#737373',
              margin: '0 0 24px',
            }}
          >
            Something went wrong. We&apos;ve been alerted — reloading usually fixes it.{/* i18n-ignore */}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#fff',
              color: '#000',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            重新加载 · Reload{/* i18n-ignore：这一档不能依赖 i18n，它可能正是崩掉的那个 */}
          </button>
          {error.digest && (
            <p style={{ fontSize: 11, color: '#525252', marginTop: 16 }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
