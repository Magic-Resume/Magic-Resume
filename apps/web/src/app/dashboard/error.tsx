'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ErrorSurface from '@/components/shared/ErrorSurface';
import { identifyCrash } from '@/lib/errors/crashIdentity';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

/**
 * 工作台段级边界。
 *
 * 与根级 `app/error.tsx` 的区别是**用户不会丢掉上下文**：侧栏和路由都还在，崩的只是这一
 * 段。所以这一档不占满屏、标题也只说「这一段」——把一次组件级的 bug 呈现成整个应用挂了，
 * 比 bug 本身更吓人。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  const { code, fingerprint } = identifyCrash(error, 'app/dashboard');

  useEffect(() => {
    console.error('Dashboard boundary caught:', error);
    appLifecycle.reactErrorCaught({
      message: error.message,
      name: error.name,
      stack: error.stack,
      digest: error.digest,
      component: 'app/dashboard',
    });
  }, [error]);

  return (
    <ErrorSurface
      fill="section"
      title={t('errorPage.fault.section.title')}
      promise={t('errorPage.fault.section.promise')}
      note={t('errorPage.note')}
      onRetry={reset}
      fingerprint={fingerprint}
      secondary={{ label: t('errorPage.actions.backToResumes'), href: '/dashboard' }}
      code={code}
      detail={
        process.env.NODE_ENV === 'development'
          ? `${error.message}\n\n${error.stack ?? ''}`
          : undefined
      }
    />
  );
}
