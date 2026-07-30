'use client';

// This component is ONLY rendered inside ClerkProvider (cloud mode).
// It calls Clerk hooks and feeds values into AppAuthContext so the rest
// of the app never needs to import from @clerk/nextjs directly.

import { useAuth, useUser, useClerk } from '@clerk/nextjs';
import { AppAuthContext, AppUser } from './context';

export function CloudAuthBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const { redirectToSignIn, signOut } = useClerk();

  const appUser: AppUser | null = user
    ? {
        fullName: user.fullName,
        primaryEmailAddress: user.primaryEmailAddress
          ? { emailAddress: user.primaryEmailAddress.emailAddress }
          : null,
        imageUrl: user.imageUrl,
      }
    : null;

  return (
    <AppAuthContext.Provider
      value={{
        isLoaded,
        isSignedIn: isSignedIn ?? false,
        userId: userId ?? null,
        getToken: () => getToken(),
        user: appUser,
        redirectToSignIn,
        // Land on /sign-in, not '/'. Routing logout through '/' let its server
        // component read a not-yet-cleared session and bounce the user straight
        // back into /dashboard or /coming-soon — logout that never reached the
        // login page. /sign-in renders unconditionally in cloud mode, so it is
        // a redirect target no stale-session race can send anywhere else.
        signOut: () => signOut({ redirectUrl: '/sign-in' }),
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}
