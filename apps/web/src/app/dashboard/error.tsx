'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw, LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

/**
 * 工作台段级边界。
 *
 * 与根级 `app/error.tsx` 的区别是**用户不会丢掉上下文**：侧栏和路由都还在，崩的只是这一
 * 段。此前工作台里任何一次渲染崩溃都会一路冒到根边界，把整屏换成一张全页错误卡——一次
 * 组件级的 bug 被呈现成整个应用挂了。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
        <AlertCircle className="h-7 w-7 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t('errorPage.title')}</h2>
        <p className="max-w-md text-sm leading-relaxed text-neutral-400">
          {t('errors.internal_error')}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={() => reset()} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          {t('errorPage.buttons.tryAgain')}
        </Button>
        <Link href="/dashboard">
          <Button variant="outline" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            {t('sidebar.resumes')}
          </Button>
        </Link>
      </div>
      {error.digest && (
        <p className="text-[11px] text-neutral-600">{error.digest}</p>
      )}
    </div>
  );
}
