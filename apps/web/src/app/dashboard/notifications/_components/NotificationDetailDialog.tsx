'use client';

import Link from 'next/link';
import { ExternalLink, X } from '@magic-resume/icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  notificationsApi,
  type AnnouncementDetail,
  type Notification,
} from '@/lib/api/notifications';

interface NotificationDetailDialogProps {
  notification: Notification;
  actionHref?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDetailDialog({
  notification,
  actionHref,
  open,
  onOpenChange,
}: NotificationDetailDialogProps) {
  const { t, i18n } = useTranslation();
  const [announcement, setAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState(false);
  const actorName = notification.actor?.firstName || notification.actor?.username;
  const createdAt = new Intl.DateTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(notification.createdAt));

  const loadAnnouncement = async () => {
    if (!notification.campaignId) return;
    setAnnouncementLoading(true);
    setAnnouncementError(false);
    try {
      setAnnouncement(await notificationsApi.getAnnouncement(notification.campaignId));
    } catch {
      setAnnouncementError(true);
    } finally {
      setAnnouncementLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !notification.campaignId) return;
    let active = true;
    setAnnouncementLoading(true);
    setAnnouncementError(false);
    void notificationsApi.getAnnouncement(notification.campaignId)
      .then((value) => active && setAnnouncement(value))
      .catch(() => active && setAnnouncementError(true))
      .finally(() => active && setAnnouncementLoading(false));
    return () => { active = false; };
  }, [notification.campaignId, open]);

  const resolvedActionHref = announcement?.actionUrl || actionHref;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-xl gap-0 overflow-hidden border-white/[0.08] bg-neutral-950 p-0 text-neutral-100 shadow-2xl shadow-black/40">
        <button
          type="button"
          aria-label={t('notificationsPage.detail.close')}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-[1] grid h-8 w-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-100 active:scale-[0.98]"
        >
          <X size={16} />
        </button>

        <DialogHeader className="border-b border-white/[0.06] px-6 pb-5 pt-6 pr-16 text-left">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.07] px-2 py-0.5 text-sky-300">
              {t(`notificationsPage.category.${notification.category}`)}
            </span>
            <time dateTime={notification.createdAt}>{createdAt}</time>
          </div>
          <DialogTitle className="text-xl font-semibold leading-snug tracking-tight text-neutral-50">
            {announcement?.title || notification.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('notificationsPage.detail.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-6">
          {announcementLoading ? (
            <div className="grid gap-3" aria-label={t('notificationsPage.detail.loading')}>
              <span className="h-3 w-full animate-pulse rounded bg-white/[0.06]" />
              <span className="h-3 w-5/6 animate-pulse rounded bg-white/[0.06]" />
              <span className="h-3 w-3/5 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ) : announcementError ? (
            <div className="rounded-xl border border-red-400/15 bg-red-400/[0.05] p-4">
              <p className="text-sm text-neutral-300">{t('notificationsPage.detail.loadFailed')}</p>
              <button
                type="button"
                onClick={() => void loadAnnouncement()}
                className="mt-3 rounded-full border border-white/10 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-sky-400/30 hover:text-sky-200"
              >
                {t('notificationsPage.detail.retry')}
              </button>
            </div>
          ) : announcement ? (
            <div>
              <p className="mb-5 text-sm leading-7 text-neutral-400">{announcement.summary}</p>
              <div className="border-t border-white/[0.06] pt-5 text-sm leading-7 text-neutral-300 [&_a]:text-sky-300 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l-2 [&_blockquote]:border-sky-400/30 [&_blockquote]:pl-4 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-4 [&_strong]:font-semibold [&_strong]:text-neutral-100">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{announcement.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-7 text-neutral-300">
              {notification.body || t('notificationsPage.detail.noBody')}
            </p>
          )}

          {!notification.campaignId && (actorName || notification.resume) ? (
            <dl className="mt-6 grid gap-3 border-t border-white/[0.06] pt-5 text-xs">
              {actorName ? (
                <div className="grid grid-cols-[76px_1fr] gap-3">
                  <dt className="text-neutral-600">{t('notificationsPage.detail.sender')}</dt>
                  <dd className="text-neutral-300">{actorName}</dd>
                </div>
              ) : null}
              {notification.resume ? (
                <div className="grid grid-cols-[76px_1fr] gap-3">
                  <dt className="text-neutral-600">{t('notificationsPage.detail.relatedResume')}</dt>
                  <dd className="truncate text-neutral-300">{notification.resume.title}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-white/[0.06] bg-white/[0.015] px-6 py-4 sm:space-x-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-3.5 py-2 text-xs text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-100 active:scale-[0.98]"
          >
            {t('notificationsPage.detail.close')}
          </button>
          {resolvedActionHref ? (
            <Link
              href={resolvedActionHref}
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 px-3.5 py-2 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/20 active:scale-[0.98]"
            >
              {announcement?.actionLabel || t('notificationsPage.detail.openAction')}
              <ExternalLink size={13} />
            </Link>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
