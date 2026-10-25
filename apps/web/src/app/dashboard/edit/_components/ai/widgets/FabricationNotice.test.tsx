import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FabricationNotice from './FabricationNotice';
import '@/i18n';

const render = (props: Record<string, unknown>) => renderToStaticMarkup(<FabricationNotice instance={{ widgetId: 'example-notice', kind: 'fabrication_notice', status: 'pending', props }} onAction={() => {}} />);

test('verification notices initially show eight findings and the exact hidden count', () => {
  const items = Array.from({ length: 11 }, (_, index) => `Example finding ${index + 1}`);
  const markup = render({ items });
  for (const item of items.slice(0, 8)) assert.ok(markup.includes(`>${item}</span>`));
  for (const item of items.slice(8)) assert.ok(!markup.includes(`>${item}</span>`));
  assert.match(markup, /展开其余 3 项/);
  assert.equal((markup.match(/Example finding \d+<\/span>/g) ?? []).length, 8);
  assert.equal((markup.match(/<button\b/g) ?? []).length, 1);
});

test('eight or fewer findings have no expansion button, and empty notices render nothing', () => {
  for (const count of [1, 8]) {
    const markup = render({ items: Array.from({ length: count }, (_, index) => `Example finding ${index}`) });
    assert.equal((markup.match(/Example finding \d+<\/span>/g) ?? []).length, count);
    assert.doesNotMatch(markup, /<button\b/);
  }
  assert.equal(render({ items: [] }), '');
  assert.equal(render({}), '');
});

test('degraded notices render the supplied localized title and body without findings', () => {
  const markup = render({ title: 'Example attachment title', body: 'Example attachment explanation' });
  assert.match(markup, /Example attachment title/);
  assert.match(markup, /Example attachment explanation/);
  assert.doesNotMatch(markup, /展开其余|<button\b/);
});
