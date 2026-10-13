import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchPages } from './content-api.mjs';
import { syncArticles } from './sync-content.mjs';
import { publicExemplars, guidePages, campusPages } from '../src/lib/public-knowledge.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GuideExamples from '../src/components/content/GuideExamples.mjs';

const article = (slug) => ({ slug, locale: 'en', title: slug, description: 'A guide', body: 'A useful guide.', datePublished: '2026-10-01', dateModified: '2026-10-14' });
const paged = (items, { failPage, wrapped = true, size = 1 } = {}) => async (url) => {
  const current = Number(url.searchParams.get('current'));
  if (current === failPage) return new Response('', { status: 503 });
  const page = { items: items.slice((current - 1) * size, current * size), total: items.length, current, size };
  return Response.json(wrapped ? { data: page } : page);
};

test('fetches all pages using Core current/size, including server-capped sizes', async () => {
  for (const wrapped of [true, false]) {
    const items = Array.from({ length: 4 }, (_, i) => article(`article-${i}`));
    assert.deepEqual(await fetchPages('https://core.example/api/content/articles?locale=en', { fetchImpl: paged(items, { wrapped, size: 2 }) }), items);
  }
});
test('page cap, incomplete and changing envelopes fail closed', async () => {
  await assert.rejects(fetchPages('https://core.example', { fetchImpl: paged([1, 2, 3]), pageCap: 2 }), /exceeded/);
  await assert.rejects(fetchPages('https://core.example', { fetchImpl: async () => Response.json({ items: [], total: 1, current: 1, size: 10 }) }), /before total/);
  await assert.rejects(fetchPages('https://core.example', { fetchImpl: async () => Response.json({ items: [] }) }), /envelope/);
  await assert.rejects(fetchPages('https://core.example', { fetchImpl: async (url) => {
    const current = Number(url.searchParams.get('current'));
    return Response.json({ items: [current], total: current + 1, current, size: 1 });
  } }), /changed/);
});
test('late API failure, invalid article, empty corpus, duplicates and cap preserve last-good files', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'landing-sync-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, 'remote');
  await mkdir(join(destination, 'en'), { recursive: true });
  await writeFile(join(destination, 'en', 'old.md'), 'last good');
  for (const [rows, options] of [
    [[article('new'), article('later')], { failPage: 2 }],
    [[article('new'), { ...article('invalid'), dateModified: 'bad date' }], {}],
    [[{ ...article('invalid'), description: 'x'.repeat(321) }], {}],
    [[], {}], [[article('same'), article('same')], {}],
  ]) {
    assert.equal(await syncArticles({ endpoint: 'https://core.example', destination, fetchImpl: paged(rows, options) }), false);
    assert.equal(await readFile(join(destination, 'en', 'old.md'), 'utf8'), 'last good');
    assert.deepEqual(await readdir(join(destination, 'en')), ['old.md']);
  }
  assert.equal(await syncArticles({ endpoint: 'https://core.example', destination, fetchImpl: paged([article('one'), article('two')]), pageCap: 1 }), false);
  assert.equal(await syncArticles({ endpoint: 'https://core.example', destination, fetchImpl: paged([article('one'), article('two')]) }), true);
  assert.deepEqual((await readdir(join(destination, 'en'))).sort(), ['one.md', 'two.md']);
  assert.match(await readFile(join(destination, 'en', 'one.md'), 'utf8'), /sources: \[\]/);
});

test('user-derived exemplars never render, including whitespace IDs or missing provenance', () => {
  const base = { id: 'editorial', sourceResumeId: null, status: 'active', role: 'Engineer', locale: 'en', content: 'Editorial example' };
  const unsafe = ['resume-123', ' ', undefined, false].map((sourceResumeId, index) => ({ ...base, id: `private-${index}`, sourceResumeId, content: 'PRIVATE RESUME TEXT', rationale: 'PRIVATE RATIONALE' }));
  const inactive = { ...base, id: 'inactive', status: 'archived', content: 'WITHDRAWN' };
  const rows = [base, ...unsafe, inactive];
  assert.deepEqual(publicExemplars(rows), [base]);
  assert.equal(guidePages(unsafe).length, 0);
  const html = renderToStaticMarkup(createElement(GuideExamples, { entries: rows }));
  assert.match(html, /Editorial example/);
  assert.doesNotMatch(html, /PRIVATE|WITHDRAWN/);
  assert.equal(publicExemplars([{ ...base, sourceResumeId: '' }]).length, 1);
});

test('campus requires published, sourced, dated rows and 30 companies per season', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), company: `Company ${i}`, season: '2027-spring', title: 'Recruiting', sourceName: 'Careers', sourceUrl: 'https://example.com/jobs', updatedAt: '2026-10-14' }));
  assert.deepEqual(campusPages([]), []);
  assert.deepEqual(campusPages(rows.slice(0, 29)), []);
  assert.deepEqual(campusPages(rows.map((row) => ({ ...row, updatedAt: undefined }))), []);
  assert.deepEqual(campusPages(rows.map((row) => ({ ...row, status: 'draft' }))), []);
  assert.deepEqual(campusPages(rows.map((row) => ({ ...row, sourceUrl: 'javascript:alert(1)' }))), []);
  assert.equal(campusPages(rows).length, 31);
});
