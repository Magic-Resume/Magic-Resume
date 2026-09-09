'use client';

import { useEffect } from 'react';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

/**
 * 根布局自己崩了的时候。
 *
 * `app/error.tsx` 接不住这一层——它在 layout 内部渲染，而 layout 已经不在了。
 *
 * 这一档不能用 i18n、不能用设计系统、不能用 `ErrorSurface`——它们正是可能已经挂掉的东西。
 * 所以文案内联双语、样式内联、颜色硬编码，依赖只有 React 本身。它跟其余三档共享的是**语气
 * 和顺序**（先承诺、再解释、最后动作），不是代码。
 *
 * 小宠走 `<img>` 读 public 下的静态资源：不经打包，构建产物坏掉时它照样出得来。
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
          color: '#EDEDED',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif',
          padding: 24,
        }}
      >
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marks/polaris-pet-offline.svg"
            width={72}
            height={72}
            alt=""
            aria-hidden="true"
            style={{ imageRendering: 'pixelated' }}
          />

          <h1
            style={{
              fontSize: 28,
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: '24px 0 0',
            }}
          >
            应用没能启动{/* i18n-ignore：这一档不能依赖 i18n，它可能正是崩掉的那个 */}
          </h1>

          <p style={{ fontSize: 16, lineHeight: 1.6, margin: '12px 0 0' }}>
            你的简历都存好了，没有受影响。{/* i18n-ignore */}
          </p>

          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: '#A3A3A3',
              margin: '8px 0 0',
            }}
          >
            我们已经收到告警。刷新一下通常就好了。{/* i18n-ignore */}
          </p>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: '#737373',
              margin: '6px 0 0',
            }}
          >
            Your resumes are saved and untouched. We&apos;ve been alerted —
            reloading usually fixes it.{/* i18n-ignore */}
          </p>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 20,
              margin: '28px 0 0',
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                height: 40,
                padding: '0 20px',
                borderRadius: 8,
                border: 'none',
                background: '#0EA5E9',
                color: '#0A0A0A',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              重新加载 · Reload{/* i18n-ignore */}
            </button>
            {/* reset() 只是重挂根布局；它没救回来时，整页刷新是另一条真正不同的路。 */}
            <button
              onClick={() => window.location.reload()}
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                color: '#A3A3A3',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              刷新整页 · Hard refresh{/* i18n-ignore */}
            </button>
          </div>

          {error.digest && (
            <p
              style={{
                fontSize: 11,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: '#737373',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                margin: '36px 0 0',
                paddingTop: 16,
              }}
            >
              ERR-{/* i18n-ignore：错误码前缀，不是界面文案 */}
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
