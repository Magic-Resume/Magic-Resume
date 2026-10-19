import { z } from 'astro/zod';
import { getAuthor } from '../data/authors.mjs';
import { hasRequiredSources } from './article-policy.mjs';

export const articleSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(320),
  locale: z.enum(['en', 'zh']),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  canonical: z.string().url().optional(),
  hreflang: z
    .array(z.object({ lang: z.string().min(2).max(16), href: z.string().url() }))
    .default([]),
  authorSlug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).refine((slug) => !!getAuthor(slug), 'Unknown author slug').optional(),
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
}).refine(hasRequiredSources, {
  path: ['sources'],
  message: 'Articles published or modified after 2026-10-14 require at least one source',
});
