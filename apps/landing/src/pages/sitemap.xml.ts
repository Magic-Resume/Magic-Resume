import type { APIRoute } from 'astro';
import { authors, authorHref } from '@/data/authors.mjs';
import { templateIds } from '@/data/templates';
import { getCampus, getGuides, campusHref, guideHref } from '@/lib/knowledge';
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/ui';
import { getTools } from '@/data/tools';
import { articleSlug, getArticles } from '@/lib/articles';

// Static routes and eligible build-time content share this sitemap.
//
// Each entry declares every locale as an alternate, including itself — that
// self-reference is required by the spec, and omitting it is the usual reason
// a bilingual pair fails to be recognised as one page in two languages.
export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://www.magic-resume.cn')).origin;
  const hreflang = (loc: string) => (loc === 'zh' ? 'zh-CN' : loc);
  const xml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const entries = [
    ...LOCALES.map((loc) => ({
      path: `/${loc}`,
      modified: undefined as Date | undefined,
      alternates: LOCALES.map((alt) => ({ lang: hreflang(alt), href: `${base}/${alt}` })),
    })),
    ...LOCALES.map((loc) => ({
      path: `/${loc}/blog`,
      modified: undefined as Date | undefined,
      alternates: LOCALES.map((alt) => ({ lang: hreflang(alt), href: `${base}/${alt}/blog` })),
    })),
    ...LOCALES.flatMap((loc) =>
      getTools(loc).map((tool) => ({
        path: `/${loc}/tools/${tool.slug}`,
        modified: undefined as Date | undefined,
      alternates: LOCALES.map((alt) => ({ lang: hreflang(alt), href: `${base}/${alt}/tools/${tool.slug}` })),
      })),
    ),
  ];
  for (const locale of LOCALES) {
    for (const id of templateIds) entries.push({
      path: `/${locale}/templates/${id}`,
      modified: undefined,
      alternates: LOCALES.map((alt) => ({ lang: hreflang(alt), href: `${base}/${alt}/templates/${id}` })),
    });
  }
  for (const page of await getCampus()) entries.push({
    path: campusHref(page),
    modified: new Date(Math.max(...page.entries.map((row) => Date.parse(row.updatedAt)))),
    alternates: [{ lang: 'zh-CN', href: `${base}${campusHref(page)}` }],
  });
  for (const page of await getGuides()) entries.push({
    path: guideHref(page), modified: undefined,
    alternates: [{ lang: hreflang(page.locale), href: `${base}${guideHref(page)}` }],
  });
  for (const author of authors) for (const locale of LOCALES) entries.push({
    path: authorHref(locale, author.slug),
    modified: undefined,
    alternates: LOCALES.map((alt) => ({ lang: hreflang(alt), href: `${base}${authorHref(alt, author.slug)}` })),
  });
  const articles = await getArticles();
  for (const article of articles) {
    const locale = article.data.locale;
    const path = `/${locale}/blog/${articleSlug(article)}`;
    entries.push({
      path,
      modified: article.data.dateModified,
      alternates: article.data.hreflang.filter((alt) => alt.lang !== 'x-default').map((alt) => ({ lang: alt.lang, href: alt.href })),
    });
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.map((entry) => {
  const xDefault = entry.alternates.find((alt) => alt.lang === hreflang(DEFAULT_LOCALE))?.href ?? `${base}/${DEFAULT_LOCALE}`;
  return `  <url>
    <loc>${xml(`${base}${entry.path}`)}</loc>
${entry.modified ? `    <lastmod>${entry.modified.toISOString()}</lastmod>\n` : ''}${entry.alternates.map((alt) => `    <xhtml:link rel="alternate" hreflang="${xml(alt.lang)}" href="${xml(alt.href)}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(xDefault)}"/>
  </url>`;
}).join('\n')}
</urlset>
`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
