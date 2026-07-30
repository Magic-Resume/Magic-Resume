import { NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const APP_MODE = process.env.NEXT_PUBLIC_APP_MODE || 'self-hosted';
// Both the app and the coming-soon/reservation page require a signed-in user.
// The whitelist gate (whitelisted → app, else → /coming-soon) runs in the
// server components; middleware only enforces "must be logged in".
// `/billing` is the payment channel's return_url: only the buyer who placed the
// order can be looking at it, and every call it makes is user-scoped anyway.
// Without it here the page renders for anonymous visitors, its API calls 401,
// and the poll times out claiming "no notification yet" — blaming the payment
// channel for what is really a missing session.
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/coming-soon(.*)',
  '/billing(.*)',
]);

/**
 * Where to send someone back after they sign in.
 *
 * Clerk redirects to `unauthenticatedUrl` literally and adds nothing of its
 * own, so a bare `/sign-in` discards the path and the query string. That was
 * survivable while `/billing` was unprotected — the page rendered, its API
 * calls 401'd — but protecting it turned a lapsed session into a lost order:
 * `?orderId=` never came back, so the return page could not poll, and could not
 * run the sync that is the only thing capturing a PayPal payment from the
 * browser.
 *
 * Same-origin only, and rebuilt from the request rather than echoed, so this
 * cannot be turned into an open redirect.
 */
function signInUrl(req: NextRequest): string {
  const url = new URL('/sign-in', req.url);
  url.searchParams.set(
    'redirect_url',
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );
  return url.toString();
}

// cloud: unauthenticated users on protected routes go to the sign-in page
// (unauthenticatedUrl avoids Clerk's default 404 on protect).
const cloudHandler = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: signInUrl(req) });
  }
});

// self-hosted: all routes open, no auth required
function selfHostedHandler(_req: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  return NextResponse.next();
}

export default APP_MODE === 'cloud' ? cloudHandler : selfHostedHandler;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
