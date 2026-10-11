import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InlineFormattedText } from './renderer/InlineFormattedText';
import { pdfInlineText } from './pdf/PdfInlineFormattedText';
import { hasInlineFormatting, parseInlineText } from './inlineFormatting';

function pdfText(node: React.ReactNode): { text: string; weights: unknown[]; styles: unknown[] } {
  if (typeof node === 'string') return { text: node, weights: [], styles: [] };
  if (Array.isArray(node)) {
    const parts = node.map(pdfText);
    return { text: parts.map((part) => part.text).join(''), weights: parts.flatMap((part) => part.weights), styles: parts.flatMap((part) => part.styles) };
  }
  if (!React.isValidElement<{ children?: React.ReactNode; style?: { fontWeight?: unknown; fontStyle?: unknown } }>(node)) return { text: '', weights: [], styles: [] };
  const content = pdfText(node.props.children);
  return { text: content.text, weights: [node.props.style?.fontWeight, ...content.weights], styles: [node.props.style?.fontStyle, ...content.styles] };
}

test('inline emphasis preserves literal text and ignores HTML attributes', () => {
  const html = renderToStaticMarkup(<InlineFormattedText value={'Array<T> & <strong onclick="alert(1)">HTML5 &amp; CSS3</strong>'} />);
  assert.equal(html, '<span style="font-weight:400">Array&lt;T&gt; &amp; <strong>HTML5 &amp; CSS3</strong></span>');
  assert.ok(!html.includes('onclick'));
  const unsafe = renderToStaticMarkup(<InlineFormattedText value={'<strong>React</strong><img src=x onerror=alert(1)>'} />);
  assert.ok(!unsafe.includes('<img'));
  assert.ok(unsafe.includes('&lt;img'));
});

test('plain text keeps literal entities and names unchanged', () => {
  assert.deepEqual(parseInlineText('A < B &amp; C'), ['A < B &amp; C']);
});

test('malformed tag openers remain literal and do not consume following formatting', () => {
  const malformed = '<b '.repeat(100_000);
  assert.equal(hasInlineFormatting(malformed), false);
  assert.deepEqual(parseInlineText(malformed), [malformed]);
  assert.deepEqual(parseInlineText(`${malformed}<strong>React</strong>`), [
    malformed,
    { tag: 'strong', children: ['React'] },
  ]);
});

test('PDF and DOM consume the same formatting nodes', () => {
  const value = 'Proficient in <strong>HTML5</strong> &amp; <em>CSS3</em>';
  const dom = renderToStaticMarkup(<InlineFormattedText value={value} />);
  const pdf = pdfText(pdfInlineText(value));
  assert.ok(dom.includes('<strong>HTML5</strong>'));
  assert.ok(pdf.weights.includes(700));
  assert.ok(pdf.styles.includes('italic'));
  assert.equal(pdf.text, 'Proficient in HTML5 & CSS3');
});
