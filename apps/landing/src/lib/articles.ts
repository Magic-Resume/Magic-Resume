import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '@/i18n/ui';

export type ArticleEntry = CollectionEntry<'articles'>;

export async function getArticles(locale?: Locale): Promise<ArticleEntry[]> {
  const entries = await getCollection('articles', (entry) =>
    locale ? entry.data.locale === locale : true,
  );
  // A successful API sync is layered over checked-in seeds. De-duplicate by
  // the public slug and prefer the remote copy without making builds depend on
  // the API being reachable.
  const byKey = new Map<string, ArticleEntry>();
  for (const entry of entries.sort((a, b) => Number(b.data.source === 'api') - Number(a.data.source === 'api'))) {
    const key = `${entry.data.locale}:${articleSlug(entry)}`;
    if (!byKey.has(key)) byKey.set(key, entry);
  }
  return [...byKey.values()].sort(
    (a, b) => b.data.datePublished.getTime() - a.data.datePublished.getTime(),
  );
}

export function articleSlug(entry: ArticleEntry): string {
  return entry.data.slug ?? entry.id.split('/').at(-1) ?? entry.id;
}

export function articleHref(locale: Locale, entry: ArticleEntry): string {
  return `/${locale}/blog/${articleSlug(entry)}`;
}

export function articleAlternates(entry: ArticleEntry) {
  return entry.data.hreflang.map((alternate) => ({
    lang: alternate.lang,
    href: alternate.href,
  }));
}

/**
 * 阅读时长。中文按 400 字/分钟、拉丁按 200 词/分钟——都是常用值,而且**从正文算**,
 * 不是写死一个数字放在那儿好看。
 */
export function articleReadMinutes(entry: ArticleEntry): number {
  const body = entry.body ?? '';
  const cjk = (body.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = body.replace(/[\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(cjk / 400 + words / 200));
}
