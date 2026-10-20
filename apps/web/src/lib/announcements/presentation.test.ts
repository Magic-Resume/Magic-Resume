import assert from 'node:assert/strict';
import { test } from 'node:test';
import { presentationSchema, toRelease } from './presentation';
const presentation = {
  kind: 'whats-new', schemaVersion: 1, version: 'Magic 2.4',
  slides: [{ id: 'boards', category: 'feature', title: '求职看板', description: '统一管理投递进度', highlights: ['自动归档'], action: { label: '立即体验', href: '/dashboard/applications' } }],
};
test('maps validated announcement data to the carousel and supports historical dates', () => {
  const release = toRelease({ summary: '本次产品更新', presentation }, '2026-10-16T00:00:00Z', 'zh');
  assert.equal(release?.label, 'Magic 2.4');
  assert.equal(release?.slides[0].category, 'New feature');
  assert.equal(release?.slides[0].action?.href, '/dashboard/applications');
  assert.match(release!.date, /2026/);
});
test('ordinary and unsupported announcements retain the article fallback', () => {
  assert.equal(toRelease({ summary: '普通正文' }, '2026-10-16', 'zh'), null);
  assert.equal(toRelease({ summary: '新版本', presentation: { ...presentation, schemaVersion: 2 } }, '2026-10-16', 'zh'), null);
  assert.equal(toRelease({ summary: '日期错误', presentation }, 'invalid', 'zh'), null);
});
test('cannot turn invalid API data into unsafe feature links or empty carousels', () => {
  assert.equal(presentationSchema.safeParse({ ...presentation, slides: [] }).success, false);
  assert.equal(presentationSchema.safeParse({ ...presentation, slides: [{ ...presentation.slides[0], action: { label: '外链', href: '//evil.example' } }] }).success, false);
  assert.equal(presentationSchema.safeParse({ ...presentation, slides: [{ ...presentation.slides[0], image: { src: 'data:text/html,script', alt: 'preview' } }] }).success, false);
});

test('general popup announcements use the campaign title without a version field', () => {
  const { version: _legacyVersion, ...popup } = presentation;
  assert.equal(toRelease({ title: '维护通知', summary: '服务维护安排', presentation: popup }, '2026-10-16', 'zh')?.label, '维护通知');
  assert.equal(toRelease({ title: '维护通知', summary: '服务维护安排', presentation }, '2026-10-16', 'zh')?.label, '维护通知');
});
