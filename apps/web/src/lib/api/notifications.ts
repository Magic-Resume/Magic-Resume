import { httpClient } from './httpClient';
import { API_ROUTES } from './routes';
import { fromAxiosError } from '@/lib/errors/normalize';

const READ_RECEIPT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000] as const;

export type NotificationCategory =
  | 'COLLABORATION'
  | 'SUPPORT'
  | 'BILLING'
  | 'ACCOUNT'
  | 'TIMELINE'
  | 'ANNOUNCEMENT';

export interface Notification {
  id: string;
  recipientId: string;
  actorId?: string | null;
  type: string;
  category: NotificationCategory;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  title: string;
  body?: string | null;
  link?: string | null;
  resumeId?: string | null;
  commentId?: string | null;
  campaignId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    username?: string | null;
    imageUrl: string | null;
  } | null;
  resume?: {
    id: string;
    title: string;
    shareId?: string | null;
  } | null;
}

export interface NotificationPage {
  items: Notification[];
  nextCursor: string | null;
}

export interface NotificationPreference {
  category: 'COLLABORATION' | 'SUPPORT' | 'TIMELINE' | 'ANNOUNCEMENT';
  emailEnabled: boolean;
}

export interface FeaturedAnnouncement {
  notificationId: string;
  receivedAt: string;
  announcement: AnnouncementDetail;
}

export interface AnnouncementDetail {
  id: string;
  title: string;
  summary: string;
  content: string;
  presentation?: unknown;
  actionLabel?: string | null;
  actionUrl?: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  publishedAt?: string | null;
}

export const notificationsApi = {
  getFeaturedAnnouncement: async (): Promise<FeaturedAnnouncement | null> => {
    const response = await httpClient.api.get(API_ROUTES.notifications.featuredAnnouncement);
    return response.data.data;
  },

  dismissAnnouncement: async (id: string): Promise<void> => {
    await httpClient.api.patch(API_ROUTES.notifications.dismissAnnouncement(id), {});
  },

  fetchPage: async (cursor?: string, limit = 30): Promise<NotificationPage> => {
    const response = await httpClient.api.get(API_ROUTES.notifications.list, {
      params: { cursor, limit },
    });
    return response.data.data;
  },

  markAsRead: async (id: string): Promise<Notification> => {
    // 已读写入幂等，服务短暂不可用时在后台有限重试。
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await httpClient.api.patch(API_ROUTES.notifications.markRead(id), {});
        return response.data.data;
      } catch (error) {
        const failure = fromAxiosError(error);
        const delay = READ_RECEIPT_RETRY_DELAYS[attempt];
        if (delay === undefined || !failure.retryable || ![502, 503, 504].includes(failure.httpStatus ?? 0)) {
          throw error;
        }
        await new Promise<void>(resolve => setTimeout(resolve, delay));
      }
    }
  },

  markAllRead: async (): Promise<{ count: number }> => {
    const response = await httpClient.api.patch(API_ROUTES.notifications.markAllRead, {});
    return response.data.data;
  },

  getPreferences: async (): Promise<NotificationPreference[]> => {
    const response = await httpClient.api.get(API_ROUTES.notifications.emailPreferences);
    return response.data.data;
  },

  updatePreferences: async (items: NotificationPreference[]): Promise<NotificationPreference[]> => {
    const response = await httpClient.api.patch(API_ROUTES.notifications.emailPreferences, { items });
    return response.data.data;
  },

  getAnnouncement: async (id: string): Promise<AnnouncementDetail> => {
    const response = await httpClient.api.get(API_ROUTES.notifications.announcement(id));
    return response.data.data;
  },
};
