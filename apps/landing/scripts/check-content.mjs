import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { templateIds } from '@magic-resume-kit/resume-schema';
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

// W3 crawler contracts are checked on emitted files, not source text.
const { DEFAULT_LOCALE } = await import('../src/i18n/ui.ts');
const { authors } = await import('../src/data/authors.mjs');
const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
assert.deepEqual(robots.match(/^User-agent:.*$/gm), ['User-agent: *']);
assert.equal(robots.split('\n').filter((line) => line === 'Content-Signal: search=yes, ai-input=yes, ai-train=yes').length, 1);
assert.match(robots, /User-agent: \*\n(?:(?!\n).+\n)*Content-Signal: search=yes, ai-input=yes, ai-train=yes\n/);
const redirect = await readFile(join(dist, 'index.html'), 'utf8');
assert.match(redirect, new RegExp(`http-equiv="refresh"[^>]+url=/${DEFAULT_LOCALE}`));
for (const [, block] of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const preferred = block.match(new RegExp(`hreflang="${DEFAULT_LOCALE === 'zh' ? 'zh-CN' : DEFAULT_LOCALE}" href="([^"]+)"`))?.[1];
  const fallback = new URL(`/${DEFAULT_LOCALE}`, new URL(block.match(/<loc>([^<]+)<\/loc>/)[1]).origin).href;
  const xDefault = block.match(/hreflang="x-default" href="([^"]+)"/)?.[1];
  assert.equal(xDefault, preferred ?? fallback, 'sitemap x-default must follow DEFAULT_LOCALE');
}
for (const locale of ['en', 'zh']) {
  const home = await readFile(join(dist, locale, 'index.html'), 'utf8');
  assert.match(home, new RegExp(`hreflang="x-default" href="[^"]+/${DEFAULT_LOCALE}"`));
  if (!authors.length) await assert.rejects(access(join(dist, locale, 'about/authors')));
}
console.log('[content-check] W3 robots, root redirect, home/sitemap x-default and author routes OK.');
