'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationList } from './_components/NotificationList';

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, isLoading, markAsRead, markAllRead, unreadCount, nextCursor, loadMore } = useNotifications();

  // i18n language resolves client-side; render nothing on the server so SSR and the
  // first client render agree (matches the dashboard's client-only list pattern).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-desk">
      {/* same container as the resume library so the two page titles align */}
      <div className="mx-auto w-full max-w-[1400px] px-6 py-10 md:px-12">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">
              {t('notificationsPage.title')}
            </h1>
            {unreadCount > 0 && (
              <span className="text-sm text-sky-300">
                {t('notificationsPage.unread', { count: unreadCount })}
              </span>
            )}
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="rounded-full px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-sky-200"
            >
              {t('notificationsPage.markAllRead')}
            </button>
          ) : null}
        </header>

        {/* feed capped to a readable column, left-aligned under the title */}
        <div className="max-w-2xl">
          <NotificationList notifications={notifications} isLoading={isLoading} markAsRead={markAsRead} />
          {nextCursor ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              className="mt-5 rounded-full border border-white/[0.08] px-3.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-sky-400/30 hover:text-sky-200"
            >
              {t('notificationsPage.loadMore')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
