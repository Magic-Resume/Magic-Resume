"use client";

import { useEffect } from 'react';
import { configureHttpClient } from '@/lib/api/httpClient';
import { useAppAuth } from '@/lib/auth';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';

export function HttpClientProvider({ children }: { children: React.ReactNode }) {
  const { getToken, userId, isLoaded } = useAppAuth();

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
  //
  // Waits for auth to resolve first. On mount `userId` is null because nothing
  // is known yet, not because nobody is signed in — and the commercial build
  // reads a null here as a sign-out and clears the stored session. That fired
  // on every page load, so a session id never survived one: every navigation
  // started a new one, which breaks anything measured per session (path
  // grouping, per-session impression dedupe, session-scoped funnels).
  useEffect(() => {
    if (!isLoaded) return;
    appLifecycle.identifyUser(userId);
  }, [isLoaded, userId]);

  return <>{children}</>;
}
