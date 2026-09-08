import { defineCollection, z } from 'astro:content';
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
  schema: z.object({
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(320),
    locale: z.enum(['en', 'zh']),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
    canonical: z.string().url().optional(),
    hreflang: z
      .array(z.object({ lang: z.string().min(2).max(16), href: z.string().url() }))
      .default([]),
    author: z.string().min(1).max(80).default('Magic Resume Editorial'),
    datePublished: z.coerce.date(),
    dateModified: z.coerce.date(),
    primaryIntent: z.string().min(1).max(80),
    tags: z.array(z.string().min(1).max(40)).max(12).default([]),
    sources: z
      .array(z.object({ title: z.string().min(1).max(160), url: z.string().url() }))
      .max(12)
      .default([]),
    featured: z.boolean().default(false),
    source: z.enum(['seed', 'api']).default('seed'),
  }),
});

export const collections = { articles };
