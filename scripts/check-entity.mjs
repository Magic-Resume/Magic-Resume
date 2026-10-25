import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Entity drift check (docs/specs/geo/spec.md §3).
// apps/landing/src/data/entity.ts is the one definition of what Magic Resume
// is. Every other surface that states it must carry it word for word, because
// answer engines build an entity by cross-checking those surfaces. Run with
// Node's type stripping so the constant is read as-is, not re-parsed.

const root = process.cwd();
const { ENTITY } = await import(path.join(root, 'apps/landing/src/data/entity.ts'));

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// README bolds the first sentence; emphasis is formatting, not wording. A
// closing `**` right after CJK punctuation only renders with a space after it
// (CommonMark flanking rules), so that space is formatting too.
const stripEmphasis = (text) => text.replace(/([。，：；！？）])\*\* /g, '$1').replace(/\*\*/g, '');

const surfaces = [
  { file: 'README.md', text: stripEmphasis(read('README.md')), expected: ENTITY.en.long, form: 'en.long' },
  { file: 'README.zh-CN.md', text: stripEmphasis(read('README.zh-CN.md')), expected: ENTITY.zh.long, form: 'zh.long' },
  { file: 'apps/web/src/lib/constants/metaConfig.ts', text: read('apps/web/src/lib/constants/metaConfig.ts'), expected: ENTITY.zh.short, form: 'zh.short' },
  { file: 'apps/docs/content/docs.json (description)', text: JSON.parse(read('apps/docs/content/docs.json')).description, expected: ENTITY.en.short, form: 'en.short' },
  { file: 'apps/docs/content/en/guide/index.mdx', text: read('apps/docs/content/en/guide/index.mdx'), expected: ENTITY.en.short, form: 'en.short' },
  { file: 'apps/docs/content/zh/guide/index.mdx', text: read('apps/docs/content/zh/guide/index.mdx'), expected: ENTITY.zh.short, form: 'zh.short' },
];

// D1 (W2): the neutral "not the same project" statement, also word for word.
const faq = (locale) => JSON.parse(read(`apps/landing/src/i18n/${locale}.json`)).faq.items.map((item) => item.a).join('\n');
surfaces.push(
  { file: 'README.md', text: read('README.md'), expected: ENTITY.en.disambiguation, form: 'en.disambiguation' },
  { file: 'README.zh-CN.md', text: read('README.zh-CN.md'), expected: ENTITY.zh.disambiguation, form: 'zh.disambiguation' },
  { file: 'apps/landing/src/i18n/en.json (faq)', text: faq('en'), expected: ENTITY.en.disambiguation, form: 'en.disambiguation' },
  { file: 'apps/landing/src/i18n/zh.json (faq)', text: faq('zh'), expected: ENTITY.zh.disambiguation, form: 'zh.disambiguation' },
  { file: 'apps/docs/content/en/guide/index.mdx', text: read('apps/docs/content/en/guide/index.mdx'), expected: ENTITY.en.disambiguation, form: 'en.disambiguation' },
  { file: 'apps/docs/content/zh/guide/index.mdx', text: read('apps/docs/content/zh/guide/index.mdx'), expected: ENTITY.zh.disambiguation, form: 'zh.disambiguation' },
);

// The docs site's publisher entity must be the landing's, or engines see two organizations.
const ORGANIZATION_ID = read('apps/landing/src/consts.ts').match(/ORGANIZATION_ID = '([^']+)'/)?.[1];
const docsOrganization = JSON.parse(read('apps/docs/content/docs.json')).seo?.organization?.id;

const violations = [];
for (const { file, text, expected, form } of surfaces) {
  if (!text.includes(expected)) violations.push(`${file}: does not contain ENTITY.${form} word for word`);
}
if (!ORGANIZATION_ID || docsOrganization !== ORGANIZATION_ID)
  violations.push(`apps/docs/content/docs.json: seo.organization.id must equal ORGANIZATION_ID in apps/landing/src/consts.ts (${ORGANIZATION_ID})`);

// The definition makes a countable claim; keep it true as templates come and go.
const { templateIds } = await import('@magic-resume-kit/resume-schema');
for (const [locale, forms] of Object.entries(ENTITY)) {
  for (const [form, text] of Object.entries(forms)) {
    const claimed = text.match(/(\d+) (?:templates|套模板)/)?.[1];
    if (claimed && Number(claimed) !== templateIds.length) {
      violations.push(`ENTITY.${locale}.${form}: claims ${claimed} templates, resume-schema has ${templateIds.length}`);
    }
  }
}

console.log(`Entity surfaces checked: ${surfaces.length}`);

if (violations.length) {
  console.error('\nEntity definition drift (fix the surface, or change apps/landing/src/data/entity.ts first):');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Entity check passed.');
}
