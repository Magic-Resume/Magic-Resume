import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { templateIds } from '@magic-resume/resume-schema';
import { campusPages, guidePages } from '../src/lib/public-knowledge.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
const llms = await readFile(join(dist, 'llms.txt'), 'utf8');
for (const locale of ['en', 'zh']) {
  for (const id of templateIds) {
    const path = `/${locale}/templates/${id}`;
    assert.ok(sitemap.includes(`${path}</loc>`), `missing sitemap entry: ${path}`);
    assert.ok(llms.includes(`${path})`), `missing llms entry: ${path}`);
    const html = await readFile(join(dist, path, 'index.html'), 'utf8');
    assert.ok(html.includes('id="resume-to-export"'), `missing real SSR preview: ${path}`);
    assert.ok(html.includes(locale === 'zh' ? '开发键盘可访问' : 'Built keyboard-accessible'), `missing SSR body text: ${path}`);
    assert.ok(html.includes('data-ref-forward="href"'), `missing CTA attribution: ${path}`);
    assert.ok(!html.includes('astro-island'), `preview should need no client hydration: ${path}`);
  }
}
const snapshot = JSON.parse(await readFile(join(root, '.content-cache/knowledge.json'), 'utf8'));
if (!campusPages(snapshot.timelines).length) {
  assert.ok(!sitemap.includes('/campus/') && !llms.includes('/campus/'));
  await assert.rejects(access(join(dist, 'zh/campus')));
}
if (!guidePages(snapshot.exemplars).length) {
  assert.ok(!sitemap.includes('/guides/') && !llms.includes('/guides/'));
  for (const locale of ['en', 'zh']) await assert.rejects(access(join(dist, locale, 'guides')));
}
console.log(`[content-check] ${templateIds.length} templates × 2 locales: SSR, sitemap, llms and attribution OK; empty knowledge routes absent.`);
