import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { useAppAuth } from '@/lib/auth';
import { notificationsApi, type Notification, type NotificationPage } from '@/lib/api/notifications';
import { toast } from 'sonner';
import i18next from 'i18next';

const KEY = 'notifications:v2';

export function useNotifications() {
  const { isLoaded, isSignedIn } = useAppAuth();
  const { data, error, isLoading, mutate } = useSWR<NotificationPage>(
    isLoaded && isSignedIn ? KEY : null,
    () => notificationsApi.fetchPage(),
    { revalidateOnFocus: true },
  );

  const upsert = useCallback(
    (notification: Notification) => {
      void mutate(
        (current) => {
          if (!current) return { items: [notification], nextCursor: null };
          const withoutDuplicate = current.items.filter((item) => item.id !== notification.id);
          return { ...current, items: [notification, ...withoutDuplicate] };
        },
        false,
      );
    },
    [mutate],
  );

  useEffect(() => {
    const onCreated = (event: Event) => {
      const notification = (event as CustomEvent<Notification>).detail;
      if (notification?.id) upsert(notification);
    };
    window.addEventListener('notification:created', onCreated);
    return () => window.removeEventListener('notification:created', onCreated);
  }, [upsert]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await mutate(
        (current) => current && {
          ...current,
          items: current.items.map((item) => item.id === id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item),
        },
        false,
      );
      await notificationsApi.markAsRead(id);
      void mutate();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      toast.error(i18next.t('notificationsPage.notificationUpdateFailed'));
      void mutate();
    }
  }, [mutate]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    await mutate(
      (current) => current && {
        ...current,
        items: current.items.map((item) => ({ ...item, isRead: true, readAt: now })),
      },
      false,
    );
    try {
      await notificationsApi.markAllRead();
      void mutate();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      void mutate();
    }
  }, [mutate]);

  const loadMore = useCallback(async () => {
    const cursor = data?.nextCursor;
    if (!cursor) return;
    const page = await notificationsApi.fetchPage(cursor);
    await mutate((current) => {
      if (!current) return page;
      const ids = new Set(current.items.map((item) => item.id));
      return {
        items: [...current.items, ...page.items.filter((item) => !ids.has(item.id))],
        nextCursor: page.nextCursor,
      };
    }, false);
  }, [data?.nextCursor, mutate]);

  const notifications = data?.items;
  const unreadCount = notifications?.filter((item) => !item.isRead).length ?? 0;
  return {
    notifications,
    nextCursor: data?.nextCursor ?? null,
    loadMore,
    isLoading,
    isError: error,
    unreadCount,
    markAsRead,
    markAllRead,
    refresh: mutate,
  };
}
