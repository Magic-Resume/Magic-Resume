import { NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
// The app-wide source of truth, which falls back to the Clerk key. Re-deriving
// the mode here with a plain `|| 'self-hosted'` meant the documented auto-detect
// deployment (Clerk key set, NEXT_PUBLIC_APP_MODE unset) ran the self-hosted
// handler: clerkMiddleware was never installed, so the protection below guarded
// nothing and `auth()` threw in the server components that expect it.
import { isCloudMode } from '@magic-resume/env';
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

// The mirror of the rule above: these are the only routes that require *not*
// being signed in. Catch-alls, because Clerk drives its own sub-routes under
// both (`/sign-in/factor-one`, …) and a signed-in visitor has no business on
// any of them.
const isAuthRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);

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

/**
 * Where a *signed-in* visitor to the sign-in page should land instead.
 *
 * `redirect_url` is honoured because `signInUrl` above put it there: someone
 * whose session lapsed mid-checkout, signed in, and came back to `/sign-in`
 * from history should still reach the order they were paying for rather than a
 * generic dashboard.
 *
 * But unlike `signInUrl`, this value arrives from the query string, so it is
 * attacker-controlled and an unchecked `NextResponse.redirect` on it is an open
 * redirect — the classic phishing hop through a domain the victim trusts. Only
 * a same-origin *path* is accepted: it must start with a single `/`, and may
 * not contain a backslash, which some browsers normalise to `/` and would turn
 * `/\evil.com` into a protocol-relative jump off-site.
 */
function afterAuthUrl(req: NextRequest): URL {
  const target = req.nextUrl.searchParams.get('redirect_url');
  const safe =
    target &&
    target.startsWith('/') &&
    !target.startsWith('//') &&
    !target.includes('\\');
  return new URL(safe ? target : '/dashboard', req.url);
}

// cloud: unauthenticated users on protected routes go to the sign-in page
// (unauthenticatedUrl avoids Clerk's default 404 on protect); signed-in users
// are kept off the sign-in/sign-up pages, which otherwise render a login form
// to somebody who is already logged in.
const cloudHandler = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: signInUrl(req) });
    return;
  }
  if (isAuthRoute(req)) {
    const { userId } = await auth();
    if (userId) return NextResponse.redirect(afterAuthUrl(req));
  }
});

// self-hosted: all routes open, no auth required
function selfHostedHandler(_req: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  return NextResponse.next();
}

export default isCloudMode ? cloudHandler : selfHostedHandler;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
