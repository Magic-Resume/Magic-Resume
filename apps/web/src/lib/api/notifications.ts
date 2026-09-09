import { httpClient } from './httpClient';
import { API_ROUTES } from './routes';

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

export interface AnnouncementDetail {
  id: string;
  title: string;
  summary: string;
  content: string;
  actionLabel?: string | null;
  actionUrl?: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  publishedAt?: string | null;
}

export const notificationsApi = {
  fetchPage: async (cursor?: string, limit = 30): Promise<NotificationPage> => {
    const response = await httpClient.api.get(API_ROUTES.notifications.list, {
      params: { cursor, limit },
    });
    return response.data.data;
  },

  markAsRead: async (id: string): Promise<Notification> => {
    const response = await httpClient.api.patch(API_ROUTES.notifications.markRead(id), {});
    return response.data.data;
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
