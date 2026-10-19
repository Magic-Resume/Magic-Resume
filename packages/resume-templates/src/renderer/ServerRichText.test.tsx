import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WysiwygContent } from '../templateLayout/WysiwygContent';

test('SSR preserves resume paragraphs and bullets without executable HTML or attributes', () => {
  const html = renderToStaticMarkup(<WysiwygContent dirtyHtml={'<p>Built <strong>accessible</strong> tools &amp; tests.</p><ul><li onclick="alert(1)">Shipped</li></ul><script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">Link text</a>'} />);
  assert.match(html, /<p>Built <strong>accessible<\/strong> tools &amp; tests.<\/p>/);
  assert.match(html, /<ul><li>Shipped<\/li><\/ul>/);
  assert.match(html, /Link text/);
  assert.doesNotMatch(html, /script|onclick|onerror|javascript:|<img|alert\(1\)/);
});
