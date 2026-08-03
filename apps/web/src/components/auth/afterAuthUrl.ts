/** Where to land when nothing asked for somewhere else. */
export const DEFAULT_AFTER_AUTH_URL = '/dashboard';

/**
 * The page the user was trying to reach before the middleware sent them here.
 *
 * The middleware puts it in `redirect_url`; without something reading it, a
 * protected route with a query string is simply lost. That is survivable for
 * `/dashboard` and not for `/billing/return?orderId=…`, where the order id is
 * the only handle the page has: no id, no polling, and no sync — which is the
 * only thing that captures a PayPal payment from the browser.
 *
 * Same-origin paths only, decided by resolving the value the way a browser
 * will rather than by matching prefixes. Prefix checks are not enough: the URL
 * parser strips ASCII tab/LF/CR before resolving, so `/<TAB>//evil.example`
 * passes a `startsWith('//')` test and still lands off-origin.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const SAME_ORIGIN_BASE = 'https://magic-resume.invalid';

export function afterAuthUrl(search: string | null | undefined): string {
  if (!search) return DEFAULT_AFTER_AUTH_URL;
  const raw = new URLSearchParams(search).get('redirect_url');
  if (!raw) return DEFAULT_AFTER_AUTH_URL;

  // Strip what the parser would strip anyway, so what we test is what resolves.
  const target = raw.replace(CONTROL_CHARS, '');
  if (!target.startsWith('/')) return DEFAULT_AFTER_AUTH_URL;

  let resolved: URL;
  try {
    resolved = new URL(target, SAME_ORIGIN_BASE);
  } catch {
    return DEFAULT_AFTER_AUTH_URL;
  }
  if (resolved.origin !== SAME_ORIGIN_BASE) return DEFAULT_AFTER_AUTH_URL;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
