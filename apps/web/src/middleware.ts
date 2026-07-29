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

// cloud: unauthenticated users on protected routes go to the sign-in page
// (unauthenticatedUrl avoids Clerk's default 404 on protect).
const cloudHandler = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect({
      unauthenticatedUrl: new URL('/sign-in', req.url).toString(),
    });
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
