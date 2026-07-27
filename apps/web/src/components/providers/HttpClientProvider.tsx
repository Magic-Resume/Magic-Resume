"use client";

import { useEffect } from 'react';
import { configureHttpClient } from '@/lib/api/httpClient';
import { useAppAuth } from '@/lib/auth';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

export function HttpClientProvider({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAppAuth();

  useEffect(() => {
    configureHttpClient(getToken);
    // No-op in the open-source build. In the commercial build the analytics
    // client sends this token with each batch, and the server reads the user
    // from it — so events get attributed without the browser ever putting an
    // account id in the payload.
    appLifecycle.configureAnalyticsAuth(getToken);
  }, [getToken]);

  // Resets the analytics session on sign-out, so the next person on a shared
  // device is not attributed to the previous one.
  useEffect(() => {
    appLifecycle.identifyUser(userId);
  }, [userId]);

  return <>{children}</>;
}
