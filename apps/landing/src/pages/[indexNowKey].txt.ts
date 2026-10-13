import type { APIRoute, GetStaticPaths } from 'astro';

/**
 * /<key>.txt — the IndexNow ownership file (indexnow.org/documentation): a
 * text file named after the key that contains the key. It is what lets
 * .github/workflows/indexnow.yml submit changed URLs for this host. The key
 * is public by design, but it lives in the hosting env (INDEXNOW_KEY) rather
 * than the repo so a fork does not claim our host. No key, no file.
 */
const key = (import.meta.env.INDEXNOW_KEY ?? '').trim();

if (key && !/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
  // IndexNow rejects anything else; fail the build rather than publish a file
  // every submission would bounce off.
  throw new Error('INDEXNOW_KEY must be 8–128 characters of a-z, A-Z, 0-9 or "-".');
}

export const getStaticPaths = (() => (key ? [{ params: { indexNowKey: key } }] : [])) satisfies GetStaticPaths;

export const GET: APIRoute = () =>
  new Response(key, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
