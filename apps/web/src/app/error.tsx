'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ErrorSurface from '@/components/shared/ErrorSurface';
import { identifyCrash } from '@/lib/errors/crashIdentity';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

/**
 * 应用级边界——整页都没能渲染出来。
 *
 * 这里的上报不能省：渲染期崩溃永远到不了 `window.onerror`，React 直接把它交给边界。少了
 * 这一行，应用最严重的一类故障（白屏）恰好是唯一一类我们永远收不到告警的。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  const { code, fingerprint } = identifyCrash(error, 'app');

  useEffect(() => {
    console.error('Global Error Boundary caught:', error);
    appLifecycle.reactErrorCaught({
      message: error.message,
      name: error.name,
      stack: error.stack,
      digest: error.digest,
      component: 'app',
    });
  }, [error]);

  return (
    <ErrorSurface
      fill="screen"
      title={t('errorPage.fault.app.title')}
      promise={t('errorPage.fault.app.promise')}
      note={t('errorPage.note')}
      onRetry={reset}
      fingerprint={fingerprint}
      secondary={{ label: t('errorPage.actions.backHome'), href: '/' }}
      code={code}
      detail={
        process.env.NODE_ENV === 'development'
          ? `${error.message}\n\n${error.stack ?? ''}`
          : undefined
      }
    />
  );
}
