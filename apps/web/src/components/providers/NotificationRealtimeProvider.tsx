'use client';

import { useEffect } from 'react';
import { useAppAuth } from '@/lib/auth';
import { isCloudMode } from '@/lib/config/app';
import { API_ORIGIN, API_ROUTES } from '@/lib/api/routes';

const RETRY_DELAYS = [1000, 2000, 5000, 10000] as const;

/**
 * Browser EventSource cannot send the Clerk bearer token. A small fetch-based
 * SSE reader keeps the same streaming semantics without exposing the stream.
 * The server replays by cursor on reconnect, while the notification hook
 * deduplicates by id before merging it into the inbox.
 */
export function NotificationRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId } = useAppAuth();

  useEffect(() => {
    if (!isCloudMode || !isLoaded || !isSignedIn || !userId) return;

    const controller = new AbortController();
    let retry = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cursor: string | undefined;

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || controller.signal.aborted) return;
        const streamUrl = new URL(`${API_ORIGIN}${API_ROUTES.notifications.stream}`);
        if (cursor) streamUrl.searchParams.set('cursor', cursor);
        const response = await fetch(streamUrl, {
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Notification stream failed: ${response.status}`);

        retry = 0;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');
            const event = frame.match(/^event:\s*(.+)$/m)?.[1];
            const data = frame.match(/^data:\s*(.+)$/m)?.[1];
            if ((event === 'notification' || event === 'notification.created') && data) {
              try {
                const notification = JSON.parse(data) as { id?: string; createdAt?: string };
                if (notification.id && notification.createdAt) {
                  cursor = btoa(JSON.stringify({ id: notification.id, createdAt: notification.createdAt }))
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                }
                window.dispatchEvent(new CustomEvent('notification:created', { detail: notification }));
              } catch {
                // A malformed frame must not take down the next reconnect.
              }
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Notification stream disconnected', error);
      }

      if (!controller.signal.aborted) {
        timeout = setTimeout(() => void connect(), RETRY_DELAYS[Math.min(retry++, RETRY_DELAYS.length - 1)]);
      }
    };

    void connect();
    return () => {
      controller.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [getToken, isLoaded, isSignedIn, userId]);

  return <>{children}</>;
}
