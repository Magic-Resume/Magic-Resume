/*
 * Build-time bridge from Core's published article API to Astro's content
 * collection. It is intentionally best-effort: a failed API must never erase
 * the last known-good static corpus or make a marketing deploy blank.
 */
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchPages, validDate, httpUrl } from './content-api.mjs';
import { hasRequiredSources } from '../src/lib/article-policy.mjs';
import { getAuthor } from '../src/data/authors.mjs';
import { syncKnowledge } from './sync-knowledge.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const remoteRoot = join(root, 'src', 'content', 'articles', 'remote');
const apiBase = (process.env.PUBLIC_CONTENT_API_URL ?? '').trim().replace(/\/+$/, '');
const apiPath = process.env.PUBLIC_CONTENT_API_PATH || '/api/content/articles';

export function isValidArticle(value) {
  return value && typeof value === 'object' &&
    typeof value.slug === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value.slug) &&
    (value.locale === 'zh' || value.locale === 'en') &&
    typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 160 &&
    typeof value.description === 'string' && value.description.length > 0 && value.description.length <= 320 &&
    typeof value.body === 'string' && value.body.length > 0 && value.body.length <= 200_000 &&
    validDate(value.datePublished) && validDate(value.dateModified) &&
    (value.status === undefined || value.status === 'published') &&
    (!value.canonical || httpUrl(value.canonical)) &&
    (!value.author || (typeof value.author === 'string' && value.author.length <= 80)) &&
    (!value.primaryIntent || (typeof value.primaryIntent === 'string' && value.primaryIntent.length <= 80)) &&
    (value.tags === undefined || (Array.isArray(value.tags) && value.tags.length <= 12 && value.tags.every((tag) => typeof tag === 'string' && tag.length > 0 && tag.length <= 40))) &&
    (value.sources === undefined || (Array.isArray(value.sources) && value.sources.length <= 12 && value.sources.every((source) => source && typeof source.title === 'string' && source.title.length > 0 && source.title.length <= 160 && httpUrl(source.url)))) &&
    (value.hreflang === undefined || (Array.isArray(value.hreflang) && value.hreflang.every((alt) => alt && typeof alt.lang === 'string' && alt.lang.length >= 2 && alt.lang.length <= 16 && httpUrl(alt.href))));
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
    hreflang.length ? 'hreflang:' : 'hreflang: []',
    ...hreflang.filter((item) => item && item.lang && item.href).map((item) => `  - lang: ${yamlQuote(item.lang)}\n    href: ${yamlQuote(item.href)}`),
    `author: ${yamlQuote(article.author || 'Magic Resume Editorial')}`,
    article.authorSlug ? `authorSlug: ${yamlQuote(article.authorSlug)}` : null,
    `datePublished: ${yamlQuote(article.datePublished)}`,
    `dateModified: ${yamlQuote(article.dateModified)}`,
    `primaryIntent: ${yamlQuote(article.primaryIntent || 'job search')}`,
    `tags: [${tags.map(yamlQuote).join(', ')}]`,
    sources.length ? 'sources:' : 'sources: []',
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

/** Fetch and validate the entire corpus before replacing any last-good files. */
export async function syncArticles({ endpoint, destination = remoteRoot, headers = {}, fetchImpl = fetch, pageCap = 100 }) {
  let staging;
  let backup;
  try {
    const fetched = await fetchPages(endpoint, { headers, fetchImpl, pageCap });
    if (!fetched.length || !fetched.every(isValidArticle)) throw new Error('empty or invalid article corpus');
    const keys = fetched.map((article) => `${article.locale}/${article.slug}`);
    if (new Set(keys).size !== keys.length) throw new Error('duplicate article across pages');
    const articles = fetched.filter((article) => {
      const reason = !hasRequiredSources(article) ? 'articles published or modified after 2026-10-14 require sources'
        : article.authorSlug !== undefined && !getAuthor(article.authorSlug) ? 'unknown authorSlug' : null;
      if (reason) console.warn(`[content-sync] dropping ${article.locale}/${article.slug}: ${reason}`);
      return !reason;
    });
    await mkdir(resolve(destination, '..'), { recursive: true });
    staging = await mkdtemp(`${destination}-staging-`);
    for (const article of articles) {
      await mkdir(join(staging, article.locale), { recursive: true });
      await writeFile(join(staging, article.locale, `${article.slug}.md`), toMarkdown(article), 'utf8');
    }
    // Stage beside the corpus so promotion is a same-filesystem rename.
    backup = `${staging}-previous`;
    try { await rename(destination, backup); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(staging, destination); } catch (error) {
      try { await rename(backup, destination); } catch { /* original may not exist */ }
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
    console.log(`[content-sync] synced ${articles.length} published article(s)`);
    return true;
  } catch (error) {
    console.warn(`[content-sync] ${error.message}; keeping existing static content.`);
    return false;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const headers = { accept: 'application/json' };
  if (process.env.PUBLIC_CONTENT_API_TOKEN) headers.authorization = `Bearer ${process.env.PUBLIC_CONTENT_API_TOKEN}`;
  if (apiBase) {
    await syncArticles({ endpoint: `${apiBase}/${apiPath.replace(/^\/+/, '')}`, headers });
  } else {
    console.log('[content-sync] PUBLIC_CONTENT_API_URL is empty; using checked-in seeds.');
  }
  await syncKnowledge({ root, apiBase });
}
