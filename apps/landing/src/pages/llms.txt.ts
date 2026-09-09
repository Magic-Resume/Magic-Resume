import type { APIRoute } from 'astro';
import { getCopy, LOCALES } from '@/i18n/ui';
import { GITHUB } from '@/consts';
import { getTools } from '@/data/tools';
import { articleHref, getArticles } from '@/lib/articles';

/**
 * /llms.txt — a plain-language index of this site for language models
 * (see llmstxt.org). Where sitemap.xml tells a crawler which URLs exist,
 * this tells a model what the product is and which page answers what.
 *
 * Generated from the same i18n copy the pages render, so the description here
 * cannot drift from the description a crawler reads on the page itself — a
 * mismatch between the two is exactly the kind of inconsistency that costs an
 * entity its credibility with answer engines.
 *
 * Everything below must be verifiable: 19 template ids in
 * packages/resume-schema, six modes in the landing copy, MIT in LICENSE.
 */
export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://www.magic-resume.cn')).origin;
  const en = getCopy('en');
  const zh = getCopy('zh');

  const faqSection = (locale: 'en' | 'zh') => {
    const copy = getCopy(locale);
    return copy.faq.items
      .map((item) => `- **${item.q}** ${item.a}`)
      .join('\n');
  };

  const articles = await getArticles();
  const body = `# Magic Resume

> ${en.meta.description}

> ${zh.meta.description}

Magic Resume is an open-source AI resume workbench. The self-hosted editor is
local-first; the hosted edition adds built-in AI, cloud sync, and version
history. Both editions ship the same 19 templates and six modes: create,
optimize, analyze, translate, interview, and export.

The defining behaviour: the AI never rewrites a resume silently. Every change is
proposed in place with a reason attached — shown as a red deletion and a green
insertion — and takes effect only when the user accepts it. Any proposal can be
skipped.

## Pages

${LOCALES.map((loc) => {
  const copy = getCopy(loc);
  const label = loc === 'zh' ? 'Chinese' : 'English';
  return `- [${copy.meta.title}](${base}/${loc}): ${label} landing page — product overview, capabilities, FAQ.`;
}).join('\n')}

## Source

- [GitHub repository](${GITHUB.repo}): MIT-licensed source, issue tracker, contribution guide.
- [Issues](${GITHUB.issues}): bug reports and feature requests.

## Tools

${LOCALES.map((loc) => getTools(loc).map((tool) => `- [${tool.title}](${base}/${loc}/tools/${tool.slug}): ${tool.description}`).join('\\n')).join('\\n')}

## Articles

${articles.map((entry) => `- [${entry.data.title}](${base}${articleHref(entry.data.locale, entry)}): ${entry.data.description}`).join('\\n')}

## FAQ (English)

${faqSection('en')}

## FAQ (中文)

${faqSection('zh')}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
