"use client";

import { useEffect } from 'react';
import { configureHttpClient } from '@/lib/api/httpClient';
import { useAppAuth } from '@/lib/auth';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

export function HttpClientProvider({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAppAuth();

  useEffect(() => {
    configureHttpClient(getToken);
  }, [getToken]);

  // No-op in the open-source build. In the commercial build this is what lets
  // browser events be tied to the same user as the server-derived ones; whether
  // the id is actually sent stays a runtime decision there.
  useEffect(() => {
    appLifecycle.identifyUser(userId);
  }, [userId]);

  return <>{children}</>;
}
