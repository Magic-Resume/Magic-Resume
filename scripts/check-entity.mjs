import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Entity drift check (docs/specs/geo/spec.md §3).
// apps/landing/src/data/entity.ts is the one definition of what the product
// is. Every other surface that states it must carry it word for word, because
// answer engines build an entity by cross-checking those surfaces. Run with
// Node's type stripping so the constant is read as-is, not re-parsed.
//
// Only the landing carries the new name (知遇 / Kenmet) so far; README, web
// metadata and the docs site are held to LEGACY_ENTITY until they move too.

const root = process.cwd();
const { ENTITY, LEGACY_ENTITY, BRAND } = await import(path.join(root, 'apps/landing/src/data/entity.ts'));
const { articleAuthorSchema } = await import(path.join(root, 'apps/landing/src/data/authors.mjs'));

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
// README bolds the first sentence; emphasis is formatting, not wording. A
// closing `**` right after CJK punctuation only renders with a space after it
// (CommonMark flanking rules), so that space is formatting too.
const stripEmphasis = (text) => text.replace(/([。，：；！？）])\*\* /g, '$1').replace(/\*\*/g, '');

const surfaces = [
  { file: 'README.md', text: stripEmphasis(read('README.md')), expected: LEGACY_ENTITY.en.long, form: 'LEGACY_ENTITY.en.long' },
  { file: 'README.zh-CN.md', text: stripEmphasis(read('README.zh-CN.md')), expected: LEGACY_ENTITY.zh.long, form: 'LEGACY_ENTITY.zh.long' },
  { file: 'apps/web/src/lib/constants/metaConfig.ts', text: read('apps/web/src/lib/constants/metaConfig.ts'), expected: LEGACY_ENTITY.zh.short, form: 'LEGACY_ENTITY.zh.short' },
  { file: 'apps/docs/content/docs.json (description)', text: JSON.parse(read('apps/docs/content/docs.json')).description, expected: LEGACY_ENTITY.en.short, form: 'LEGACY_ENTITY.en.short' },
  { file: 'apps/docs/content/en/guide/index.mdx', text: read('apps/docs/content/en/guide/index.mdx'), expected: LEGACY_ENTITY.en.short, form: 'LEGACY_ENTITY.en.short' },
  { file: 'apps/docs/content/zh/guide/index.mdx', text: read('apps/docs/content/zh/guide/index.mdx'), expected: LEGACY_ENTITY.zh.short, form: 'LEGACY_ENTITY.zh.short' },
];

// D1 (W2): the neutral "not the same project" statement, also word for word.
const faqItems = (locale) => JSON.parse(read(`apps/landing/src/i18n/${locale}.json`)).faq.items;
const faq = (locale) => faqItems(locale).map((item) => item.a).join('\n');
surfaces.push(
  { file: 'README.md', text: read('README.md'), expected: LEGACY_ENTITY.en.disambiguation, form: 'LEGACY_ENTITY.en.disambiguation' },
  { file: 'README.zh-CN.md', text: read('README.zh-CN.md'), expected: LEGACY_ENTITY.zh.disambiguation, form: 'LEGACY_ENTITY.zh.disambiguation' },
  { file: 'apps/landing/src/i18n/en.json (faq)', text: faq('en'), expected: ENTITY.en.disambiguation, form: 'ENTITY.en.disambiguation' },
  { file: 'apps/landing/src/i18n/zh.json (faq)', text: faq('zh'), expected: ENTITY.zh.disambiguation, form: 'ENTITY.zh.disambiguation' },
  { file: 'apps/docs/content/en/guide/index.mdx', text: read('apps/docs/content/en/guide/index.mdx'), expected: LEGACY_ENTITY.en.disambiguation, form: 'LEGACY_ENTITY.en.disambiguation' },
  { file: 'apps/docs/content/zh/guide/index.mdx', text: read('apps/docs/content/zh/guide/index.mdx'), expected: LEGACY_ENTITY.zh.disambiguation, form: 'LEGACY_ENTITY.zh.disambiguation' },
);

// The docs site's publisher entity must be the landing's, or engines see two organizations.
const ORGANIZATION_ID = read('apps/landing/src/consts.ts').match(/ORGANIZATION_ID = '([^']+)'/)?.[1];
const docsOrganization = JSON.parse(read('apps/docs/content/docs.json')).seo?.organization?.id;

const violations = [];
for (const { file, text, expected, form } of surfaces) {
  if (!text.includes(expected)) violations.push(`${file}: does not contain ${form} word for word`);
}
if (!ORGANIZATION_ID || docsOrganization !== ORGANIZATION_ID)
  violations.push(`apps/docs/content/docs.json: seo.organization.id must equal ORGANIZATION_ID in apps/landing/src/consts.ts (${ORGANIZATION_ID})`);

// The definition makes a countable claim; keep it true as templates come and go.
const { templateIds } = await import('@magic-resume-kit/resume-schema');
for (const [name, entity] of Object.entries({ ENTITY, LEGACY_ENTITY })) {
  for (const [locale, forms] of Object.entries(entity)) {
    for (const [form, text] of Object.entries(forms)) {
      const claimed = text.match(/(\d+) (?:templates|套模板)/)?.[1];
      if (claimed && Number(claimed) !== templateIds.length) {
        violations.push(`${name}.${locale}.${form}: claims ${claimed} templates, resume-schema has ${templateIds.length}`);
      }
    }
  }
}

// authors.mjs repeats the Organization name as a literal (it runs without type
// stripping); one @id carrying two names reads as two entities.
const fallbackAuthor = articleAuthorSchema(undefined, 'zh', 'https://www.magic-resume.cn');
if (fallbackAuthor['@id'] !== ORGANIZATION_ID || fallbackAuthor.name !== BRAND.name)
  violations.push(`apps/landing/src/data/authors.mjs: fallback author must be ${ORGANIZATION_ID} named ${BRAND.name}`);

// Brand rename: on the landing the old name may only appear where it explains
// the rename or the magicv.art disambiguation. Remote articles are fetched from
// the content API at build time and are not ours to lint.
const LEGACY_NAME = /Magic Resume/i;
const LEGACY_CONTEXT = /原名|原来的|formerly|new name of|magicv\.art/;
const landingSrc = 'apps/landing/src';
const skip = (file) => file === `${landingSrc}/data/entity.ts` || /\/content\/articles\/remote/.test(file);
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const file = `${dir}/${entry.name}`;
  return entry.isDirectory() ? walk(file) : /\.(astro|ts|tsx|mjs|md|mdx)$/.test(entry.name) ? [file] : [];
});
for (const file of walk(landingSrc).filter((file) => !skip(file))) {
  read(file).split('\n').forEach((line, index) => {
    if (LEGACY_NAME.test(line) && !LEGACY_CONTEXT.test(line)) violations.push(`${file}:${index + 1}: old brand name outside the rename whitelist`);
  });
}
for (const locale of ['en', 'zh']) {
  const copy = JSON.parse(read(`${landingSrc}/i18n/${locale}.json`));
  // A FAQ item that explains the rename may name the old brand in its question too.
  copy.faq.items = copy.faq.items.filter((item) => !LEGACY_CONTEXT.test(item.a));
  if (LEGACY_NAME.test(JSON.stringify(copy))) violations.push(`${landingSrc}/i18n/${locale}.json: old brand name outside the rename FAQ`);
}

console.log(`Entity surfaces checked: ${surfaces.length}`);

if (violations.length) {
  console.error('\nEntity definition drift (fix the surface, or change apps/landing/src/data/entity.ts first):');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Entity check passed.');
}
