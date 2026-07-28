'use client';

import { createContext, useContext } from 'react';

export interface AppUser {
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  imageUrl?: string | null;
}

export interface AppAuthContextValue {
  /**
   * Whether the auth provider has resolved yet.
   *
   * Distinguishes "not signed in" from "not known yet". Before this is true,
   * `userId` is null for a reason that says nothing about the visitor, and a
   * consumer that reads it as a signed-out state acts on a fact that is not in
   * evidence. Always true in self-hosted mode, where there is nothing to wait
   * for.
   */
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
  user: AppUser | null;
  redirectToSignIn: () => void;
  signOut: () => Promise<void>;
}

// Default: self-hosted values (no auth, always locally "signed in")
const defaultValue: AppAuthContextValue = {
  isLoaded: true,
  isSignedIn: true,
  userId: null,
  getToken: async () => null,
  user: { fullName: null, primaryEmailAddress: null, imageUrl: null },
  redirectToSignIn: () => {},
  signOut: async () => {},
};

export const AppAuthContext = createContext<AppAuthContextValue>(defaultValue);

export function useAppAuth(): AppAuthContextValue {
  return useContext(AppAuthContext);
}

export function useAppUser(): { user: AppUser | null } {
  const { user } = useContext(AppAuthContext);
  return { user };
}
