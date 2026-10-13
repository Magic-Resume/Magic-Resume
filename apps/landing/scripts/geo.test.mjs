import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPricing, pricingSchema } from '../src/data/pricing.ts';
import { loadSoftwareVersion, parseSoftwareVersion } from '../src/data/software-version.ts';
import { articleSchema } from '../src/lib/article-schema.ts';
import { authors, articleAuthorSchema } from '../src/data/authors.mjs';
import { DEFAULT_LOCALE, getCopy } from '../src/i18n/ui.ts';

const snapshot = {
  locale: 'zh',
  plans: [
    { id: 'free', name: 'Free', priceCents: 0, currency: 'CNY', interval: null },
    { id: 'pro', name: 'Pro', priceCents: 1900, currency: 'CNY', interval: 'month' },
    { id: 'max', name: 'Max', priceCents: 49900, currency: 'CNY', interval: 'year' },
  ].map((plan) => ({ ...plan, tagline: 'Plan', features: ['Editing'] })),
};

test('real pricing snapshot emits exact offers and billing periods', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url.searchParams.get('locale'), 'zh');
    return Response.json(snapshot);
  });
  const pricing = await loadPricing(getCopy('zh'), 'zh', 'https://pricing.example/snapshot');
  assert.equal(pricing.source, 'snapshot');
  const schema = pricingSchema(pricing);
  assert.deepEqual(schema.offers.map((offer) => [offer['@type'], offer.price, offer.priceCurrency]), [
    ['Offer', '0.00', 'CNY'], ['Offer', '19.00', 'CNY'], ['Offer', '499.00', 'CNY'],
  ]);
  assert.deepEqual(schema.offers.map((offer) => offer.priceSpecification.billingDuration), [undefined, 'P1M', 'P1Y']);
  for (const offer of schema.offers) {
    assert.equal(offer.priceSpecification['@type'], 'UnitPriceSpecification');
    assert.equal(offer.priceSpecification.price, offer.price);
    assert.equal(offer.priceSpecification.priceCurrency, offer.priceCurrency);
  }
});

test('static pricing and failed, invalid or wrong-locale snapshots omit offers entirely', async (t) => {
  const assertFallback = (result) => {
    assert.equal(result.source, 'fallback');
    assert.equal(result.plans.length, 3);
    assert.equal(Object.hasOwn(pricingSchema(result), 'offers'), false);
  };
  assertFallback(await loadPricing(getCopy('zh'), 'zh'));
  const fetch = t.mock.method(globalThis, 'fetch');
  for (const response of [
    () => new Response('', { status: 503 }),
    () => Response.json({ ...snapshot, locale: 'en' }),
    () => Response.json({ ...snapshot, plans: snapshot.plans.slice(1) }),
    () => Response.json({ ...snapshot, plans: snapshot.plans.map((plan) => ({ ...plan, priceCents: -1 })) }),
    () => { throw new Error('offline'); },
  ]) {
    fetch.mock.mockImplementation(async () => response());
    assertFallback(await loadPricing(getCopy('zh'), 'zh', 'https://pricing.example/snapshot'));
  }
});

test('version comes from the newest release heading; malformed or missing changelog omits it', async (t) => {
  const changelog = '# Changelog\n# Unreleased\n# [v2.6.5](https://example.com/release) (2026-10-12)\n# [v2.6.4](https://example.com/old) (2026-09-30)\n';
  assert.equal(parseSoftwareVersion(changelog), '2.6.5');
  for (const invalid of ['', 'v2.6.5', '## [v2.6.5](url) (2026-10-12)', '# [v2.6](url) (2026-10-12)', '# [v2.6.5](url)']) {
    assert.equal(parseSoftwareVersion(invalid), undefined);
  }
  const dir = await mkdtemp(join(tmpdir(), 'landing-version-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'CHANGELOG.md');
  assert.equal(await loadSoftwareVersion(path), undefined);
  await writeFile(path, changelog);
  assert.equal(await loadSoftwareVersion(path), '2.6.5');
  await writeFile(path, 'Unreleased');
  assert.equal(await loadSoftwareVersion(path), undefined);
});

const article = { title: 'Guide', description: 'A guide', locale: 'zh', primaryIntent: 'job search', datePublished: '2026-10-01', dateModified: '2026-10-14' };
test('collection sources gate includes publication and revision dates, after the entire cutoff day', () => {
  assert.equal(articleSchema.safeParse(article).success, true);
  assert.equal(articleSchema.safeParse({ ...article, dateModified: '2026-10-14T23:59:59Z' }).success, true);
  for (const dateField of ['datePublished', 'dateModified']) {
    const newer = { ...article, [dateField]: '2026-10-15' };
    for (const sources of [undefined, []]) assert.equal(articleSchema.safeParse({ ...newer, sources }).success, false);
    assert.equal(articleSchema.safeParse({ ...newer, sources: [{ title: 'Source', url: 'https://example.org/research' }] }).success, true);
  }
  assert.equal(articleSchema.safeParse({ ...article, authorSlug: 'unregistered' }).success, false);
});

test('empty authors ship no people; a registered author resolves to a localized biography URL', () => {
  assert.deepEqual(authors, []);
  assert.deepEqual(articleAuthorSchema(undefined, 'zh', 'https://preview.example'), {
    '@type': 'Organization', '@id': 'https://www.magic-resume.cn/#organization', name: 'Magic Resume',
  });
  const fixture = { slug: 'test-author', name: 'Test fixture', bio: 'Only a test fixture', url: 'https://example.org', sameAs: ['https://example.org/profile'] };
  for (const locale of ['zh', 'en']) {
    const schema = articleAuthorSchema(fixture, locale, 'https://www.magic-resume.cn');
    assert.equal(schema['@type'], 'Person');
    assert.equal(schema.name, fixture.name);
    assert.equal(schema.url, `https://www.magic-resume.cn/${locale}/about/authors/test-author`);
    assert.deepEqual(schema.sameAs, fixture.sameAs);
  }
});

test('Vercel negotiates zh/en and sends missing or other languages to the default locale', async () => {
  assert.equal(DEFAULT_LOCALE, 'zh');
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const root = config.redirects.filter((rule) => rule.source === '/');
  assert.deepEqual(root.map((rule) => rule.has?.[0].value), ['^zh(?:-|,|;|$)', '^en(?:-|,|;|$)', undefined]);
  for (const [header, locale] of [[undefined, 'zh'], ['zh-CN,en;q=0.8', 'zh'], ['en-US,zh;q=0.8', 'en'], ['en', 'en'], ['en;q=0.5', 'en'], ['en,zh', 'en'], ['fr', 'zh']]) {
    const rule = root.find((rule) => !rule.has || (header && new RegExp(rule.has[0].value).test(header)));
    assert.equal(rule.destination, `/${locale}`);
  }
});
