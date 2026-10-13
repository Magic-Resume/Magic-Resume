import { defineCollection } from 'astro:content';
import { articleSchema } from './lib/article-schema';
import { glob } from 'astro/loaders';

/**
 * Editorial content is deliberately a small, portable contract. The files are
 * checked into the landing build by default; `scripts/sync-content.mjs` can
 * refresh the same directory from Core's published-article API in CI.
 */
const articles = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/articles',
    retainBody: true,
    generateId: ({ entry, data }) => {
      const parts = entry.split('/');
      const locale = typeof data.locale === 'string' ? data.locale : parts.at(-2) ?? 'article';
      const slug = typeof data.slug === 'string' ? data.slug : parts.at(-1)?.replace(/\.[^.]+$/, '') ?? 'entry';
      const source = data.source === 'api' ? 'api' : 'seed';
      return `${locale}-${slug}-${source}`;
    },
  }),
  schema: articleSchema,
});

export const collections = { articles };
