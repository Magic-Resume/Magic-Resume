/*
 * Build-time bridge from Core's published article API to Astro's content
 * collection. It is intentionally best-effort: a failed API must never erase
 * the last known-good static corpus or make a marketing deploy blank.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const remoteRoot = join(root, 'src', 'content', 'articles', 'remote');
const apiBase = (process.env.PUBLIC_CONTENT_API_URL ?? '').trim().replace(/\/+$/, '');
const apiPath = process.env.PUBLIC_CONTENT_API_PATH || '/api/content/articles';

if (!apiBase) {
  console.log('[content-sync] PUBLIC_CONTENT_API_URL is empty; using checked-in seeds.');
  process.exit(0);
}

const endpoint = `${apiBase}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
const headers = { accept: 'application/json' };
if (process.env.PUBLIC_CONTENT_API_TOKEN) {
  headers.authorization = `Bearer ${process.env.PUBLIC_CONTENT_API_TOKEN}`;
}

function isValidArticle(value) {
  return value && typeof value === 'object' &&
    typeof value.slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value.slug) &&
    (value.locale === 'zh' || value.locale === 'en') &&
    typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 160 &&
    typeof value.description === 'string' && value.description.length > 0 &&
    typeof value.body === 'string' && value.body.length > 0 && value.body.length <= 200_000 &&
    typeof value.datePublished === 'string' && typeof value.dateModified === 'string';
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function safeMarkdown(value) {
  // Published content is authored/reviewed in Core. Still strip executable
  // HTML before putting it in a static page so a compromised source cannot
  // turn the build into an XSS delivery mechanism.
  return value
    .replace(/<\/?script\b[^>]*>/gi, '')
    .replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function toMarkdown(article) {
  const sources = Array.isArray(article.sources) ? article.sources : [];
  const tags = Array.isArray(article.tags) ? article.tags : [];
  const hreflang = Array.isArray(article.hreflang) ? article.hreflang : [];
  const lines = [
    '---',
    `title: ${yamlQuote(article.title)}`,
    `description: ${yamlQuote(article.description)}`,
    `locale: ${article.locale}`,
    `slug: ${article.slug}`,
    article.canonical ? `canonical: ${yamlQuote(article.canonical)}` : null,
    'hreflang:',
    ...hreflang.filter((item) => item && item.lang && item.href).map((item) => `  - lang: ${yamlQuote(item.lang)}\n    href: ${yamlQuote(item.href)}`),
    `author: ${yamlQuote(article.author || 'Magic Resume Editorial')}`,
    `datePublished: ${yamlQuote(article.datePublished)}`,
    `dateModified: ${yamlQuote(article.dateModified)}`,
    `primaryIntent: ${yamlQuote(article.primaryIntent || 'job search')}`,
    `tags: [${tags.map(yamlQuote).join(', ')}]`,
    'sources:',
    ...sources.filter((item) => item && item.title && item.url).map((item) => `  - title: ${yamlQuote(item.title)}\n    url: ${yamlQuote(item.url)}`),
    'featured: false',
    'source: api',
    '---',
    '',
    safeMarkdown(article.body),
    '',
  ];
  return lines.filter((line) => line !== null).join('\n');
}

let response;
try {
  response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload?.data?.items ?? payload?.items;
  if (!Array.isArray(rows)) throw new Error('response does not contain an article array');
  const articles = rows.filter(isValidArticle);
  if (articles.length === 0) throw new Error('response contained no valid published articles');

  await mkdir(remoteRoot, { recursive: true });
  const desired = new Set();
  for (const article of articles) {
    const path = join(remoteRoot, article.locale, `${article.slug}.md`);
    desired.add(path);
    await mkdir(join(remoteRoot, article.locale), { recursive: true });
    await writeFile(path, toMarkdown(article), 'utf8');
  }

  // Remove stale API copies only after every new file has been written. Seed
  // files live outside `remote`, so an outage or an empty response cannot
  // delete the fallback corpus.
  for (const locale of ['en', 'zh']) {
    const dir = join(remoteRoot, locale);
    let files = [];
    try { files = await readdir(dir); } catch { continue; }
    for (const file of files.filter((name) => name.endsWith('.md'))) {
      const path = join(dir, file);
      if (!desired.has(path)) await rm(path, { force: true });
    }
  }
  console.log(`[content-sync] synced ${articles.length} published article(s) from ${endpoint}`);
} catch (error) {
  console.warn(`[content-sync] ${error instanceof Error ? error.message : String(error)}; keeping existing static content.`);
  process.exit(0);
}
