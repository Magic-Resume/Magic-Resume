/*
 * Run by .github/workflows/indexnow.yml after a production deploy of the
 * landing site: diff the live sitemap against the one from the previous run
 * and submit new or re-dated URLs to IndexNow (Bing, Yandex, Seznam, Naver…),
 * so they are recrawled within hours instead of whenever a crawler drops by.
 *
 * The previous sitemap lives at $INDEXNOW_STATE (restored from the Actions
 * cache). Without one — first run, evicted cache — every URL is submitted;
 * the site is small enough that this is cheap. On success the live sitemap is
 * written back for the next run; on failure it is not, so the next run retries.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const site = (process.env.SITE || 'https://www.magic-resume.cn').replace(/\/+$/, '');
const key = (process.env.INDEXNOW_KEY ?? '').trim();
const statePath = process.env.INDEXNOW_STATE || '.indexnow/sitemap.xml';

if (!key) {
  console.log('[indexnow] INDEXNOW_KEY is not set; nothing to do.');
  process.exit(0);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
  return response.text();
}

/** loc → lastmod ('' when the entry has none). */
function parseSitemap(xml) {
  const entries = new Map();
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    if (loc) entries.set(loc, block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1] ?? '');
  }
  return entries;
}

// IndexNow rejects every URL if the key file is missing or stale, so check
// it first and fail with a reason instead of a bare 403.
const served = await fetchText(`${site}/${key}.txt`).catch(() => '');
if (served.trim() !== key) {
  throw new Error(`${site}/${key}.txt is missing or does not contain the key; is the same INDEXNOW_KEY set in Vercel?`);
}

const liveXml = await fetchText(`${site}/sitemap.xml`);
const live = parseSitemap(liveXml);
const previous = parseSitemap(await readFile(statePath, 'utf8').catch(() => ''));
const changed = [...live].filter(([loc, lastmod]) => !previous.has(loc) || previous.get(loc) !== lastmod).map(([loc]) => loc);

console.log(`[indexnow] ${live.size} URLs in sitemap, ${previous.size} in previous snapshot, ${changed.length} new or changed.`);

if (changed.length > 0) {
  const host = new URL(site).host;
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList: changed.slice(0, 10_000) }),
  });
  // 200 = accepted, 202 = accepted, key validation pending.
  if (response.status !== 200 && response.status !== 202) {
    throw new Error(`IndexNow responded ${response.status}: ${await response.text()}`);
  }
  for (const url of changed) console.log(`  ${url}`);
  console.log(`[indexnow] submitted (${response.status}).`);
}

await mkdir(dirname(statePath), { recursive: true });
await writeFile(statePath, liveXml);
