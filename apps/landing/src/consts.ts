import type { Locale } from '@/i18n/ui';

// Cross-app links. Leave PUBLIC_WEB_ORIGIN empty for same-origin deployments,
// or set it to the real web service origin when landing is deployed separately.
const WEB_ORIGIN = normalizeOrigin(
  import.meta.env.PUBLIC_WEB_ORIGIN ?? import.meta.env.PUBLIC_APP_ORIGIN ?? '',
);

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export const APP_LINKS = {
  dashboard: `${WEB_ORIGIN}/dashboard`,
} as const;

/** Where on the page a visitor started their way into the app. */
export type CtaPlacement = 'header' | 'hero' | 'cta_section' | 'footer';

/**
 * A link into the app that says where it was clicked, and in which language.
 *
 * The landing site is a static Astro build with no analytics of its own, so a
 * click here is invisible until the visitor arrives on the other side. Carrying
 * the origin in the query string is what lets the app attribute a sign-up to
 * this page — and to which button on it — without the public marketing site
 * having to load an SDK.
 *
 * `utm_term` carries the locale. Without it the two language editions are
 * indistinguishable downstream, which would make any change to the default
 * language (spec D1) unmeasurable: we could switch the apex to Chinese and
 * never learn whether it helped. Instrument first, then change behaviour.
 *
 * Only reachable clicks are covered: a visitor who leaves for GitHub, or who
 * never finishes loading the app, is not counted. That is the tradeoff of doing
 * this from the destination rather than the source.
 */
export function dashboardLink(
  placement: CtaPlacement,
  locale: Locale,
): string {
  const params = new URLSearchParams({
    utm_source: 'landing',
    utm_medium: 'cta',
    utm_content: placement,
    utm_term: locale,
  });
  return `${APP_LINKS.dashboard}?${params.toString()}`;
}

export const GITHUB = {
  repo: 'https://github.com/Magic-Resume/Magic-Resume',
  issues: 'https://github.com/Magic-Resume/Magic-Resume/issues',
  contributors: 'https://github.com/Magic-Resume/Magic-Resume/graphs/contributors',
  contribImage: 'https://contrib.rocks/image?repo=Magic-Resume/Magic-Resume',
  owner: 'Magic-Resume',
  name: 'Magic-Resume',
} as const;

export const CONTACT_EMAIL = 'linmoeqc@qq.com';
