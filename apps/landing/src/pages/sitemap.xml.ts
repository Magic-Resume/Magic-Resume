import type { APIRoute } from 'astro';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/ui';

// Small hand-rolled sitemap (two locale roots). Avoids a heavy dependency for
// what is, today, two URLs. Add entries here as the landing grows.
//
// Each entry declares every locale as an alternate, including itself — that
// self-reference is required by the spec, and omitting it is the usual reason
// a bilingual pair fails to be recognised as one page in two languages.
export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('https://magic-resume.cn')).origin;
  const hreflang = (loc: string) => (loc === 'zh' ? 'zh-CN' : loc);
  const alternates = LOCALES.map(
    (loc) =>
      `    <xhtml:link rel="alternate" hreflang="${hreflang(loc)}" href="${base}/${loc}"/>`,
  )
    .concat(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${base}/${DEFAULT_LOCALE}"/>`,
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LOCALES.map(
  (loc) => `  <url>
    <loc>${base}/${loc}</loc>
${alternates}
  </url>`,
).join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
