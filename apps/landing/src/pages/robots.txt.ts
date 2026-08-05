import type { APIRoute } from 'astro';

// Generated rather than kept as a static file so the sitemap URL always matches
// the configured `site` (SITE_URL differs between preview and production, and a
// hard-coded absolute URL here would point previews at the live sitemap).
export const GET: APIRoute = ({ site }) => {
  const base = (site ?? new URL('https://magic-resume.cn')).origin;
  const body = `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
