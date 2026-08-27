'use client';

import { useTranslation } from 'react-i18next';

/**
 * 校招时间线壳。
 *
 * 挪进 `/dashboard` 之下是为了**要求登录**——middleware 只保护这个前缀，放在外面时
 * 它是匿名可读的。侧栏由 dashboard 的 layout 提供，这里只补一行标题，和简历库 /
 * 资产库 / 通知中心同构。
 *
 * 筛选状态仍然在 URL 的 search params 里，链接照旧能分享——只是收到链接的人要先登录。
 */
export default function TimelinesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex shrink-0 items-baseline gap-2.5 px-6 pb-5 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
          {t('knowledge.title')}
        </h1>
      </header>
      <main className="min-w-0 flex-1 px-6 pb-10">{children}</main>
    </div>
  );
}
