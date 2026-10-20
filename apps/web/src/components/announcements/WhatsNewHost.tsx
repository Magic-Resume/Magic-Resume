'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { useAppAuth } from '@/lib/auth';
import { isCloudMode } from '@/lib/config/app';
import { notificationsApi, type FeaturedAnnouncement, type Notification } from '@/lib/api/notifications';
import { toRelease } from '@/lib/announcements/presentation';
import { WhatsNew } from './whats-new';
import { useWhatsNewLabels } from './useWhatsNewLabels';

export function WhatsNewHost() {
  const { isLoaded, isSignedIn, userId } = useAppAuth();
  if (!isCloudMode || !isLoaded || !isSignedIn || !userId) return null;
  return <UserWhatsNewHost key={userId} userId={userId} />;
}

function UserWhatsNewHost({ userId }: { userId: string }) {
  const { i18n, t } = useTranslation();
  const labels = useWhatsNewLabels();
  const router = useRouter();
  const { mutate: mutateCache } = useSWRConfig();
  const { data, mutate } = useSWR<FeaturedAnnouncement | null>(
    ['announcements:featured', userId], () => notificationsApi.getFeaturedAnnouncement(),
    { revalidateOnFocus: true, shouldRetryOnError: false, dedupingInterval: 5000 },
  );
  const [viewing, setViewing] = useState<FeaturedAnnouncement | null>(null);
  const [suppressed, setSuppressed] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const openRef = useRef(false);
  const refreshAfterClose = useRef(false);

  useEffect(() => {
    const onCreated = (event: Event) => {
      const item = (event as CustomEvent<Notification>).detail;
      if (item?.category !== 'ANNOUNCEMENT' || !item.campaignId) return;
      if (openRef.current) refreshAfterClose.current = true;
      else void mutate();
    };
    const onRead = () => { if (!openRef.current) void mutate(); };
    window.addEventListener('notification:created', onCreated);
    window.addEventListener('notification:read', onRead);
    return () => {
      window.removeEventListener('notification:created', onCreated);
      window.removeEventListener('notification:read', onRead);
    };
  }, [mutate]);

  const featured = data && !suppressed.includes(data.notificationId) ? data : null;
  const current = viewing ?? featured;
  const release = current && toRelease(current.announcement, current.receivedAt, i18n.language);
  if (!current || !release) return null;

  function close() {
    openRef.current = false;
    setViewing(null);
    if (refreshAfterClose.current) { refreshAfterClose.current = false; void mutate(); }
  }

  return <WhatsNew key={current.announcement.id} release={release} className="wn-teaser--dashboard"
    labels={labels} open={Boolean(viewing)} showTeaser={Boolean(featured)}
    onOpenChange={open => {
      if (!open) { close(); return; }
      openRef.current = true;
      setViewing(current);
      // 保留当前弹窗快照，已读后的缓存刷新不能把正在看的弹窗卸载。
      void notificationsApi.markAsRead(current.notificationId).then(() => {
        if (!alive.current) return;
        setSuppressed(ids => [...ids, current.notificationId]);
        void mutateCache('notifications:v2');
        window.dispatchEvent(new CustomEvent('notification:read'));
      }).catch(() => { if (alive.current) toast.error(t('whatsNew.readFailed')); });
    }}
    onDismiss={() => {
      setSuppressed(ids => [...ids, current.notificationId]);
      void notificationsApi.dismissAnnouncement(current.announcement.id).catch(() => {
        if (!alive.current) return;
        setSuppressed(ids => ids.filter(id => id !== current.notificationId));
        toast.error(t('whatsNew.dismissFailed'));
        void mutate();
      });
    }}
    onAction={action => { close(); router.push(action.href); }} />;
}
