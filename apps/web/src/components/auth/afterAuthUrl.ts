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
 * Same-origin paths only. Anything else — an absolute URL, a protocol-relative
 * `//evil.example`, a backslash a browser may normalise into one — falls back
 * to the default, so this cannot be used to bounce a freshly signed-in session
 * off the site.
 */
export function afterAuthUrl(search: string | null | undefined): string {
  if (!search) return DEFAULT_AFTER_AUTH_URL;
  const target = new URLSearchParams(search).get('redirect_url');
  if (!target) return DEFAULT_AFTER_AUTH_URL;
  if (!target.startsWith('/')) return DEFAULT_AFTER_AUTH_URL;
  if (target.startsWith('//') || target.startsWith('/\\')) {
    return DEFAULT_AFTER_AUTH_URL;
  }
  return target;
}
