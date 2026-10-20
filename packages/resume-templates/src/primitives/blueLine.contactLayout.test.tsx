import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { defaultResume } from '@magic-resume/resume-schema';
import { blueLineTemplate } from '../config/blue-line-template';
import { MagicResumePdfDocument } from '../pdf/MagicResumePdfDocument';
import { magicPdfHyphenationCallback } from '../pdf/hyphenation';

Font.register({ family: 'Source Han Sans SC', fonts: [
  { src: fileURLToPath(new URL('../../../../apps/web/public/fonts/full/SourceHanSansSC-Regular.woff', import.meta.url)), fontWeight: 400 },
  { src: fileURLToPath(new URL('../../../../apps/web/public/fonts/full/SourceHanSansSC-Bold.woff', import.meta.url)), fontWeight: 700 },
] });
Font.registerHyphenationCallback(magicPdfHyphenationCallback);

interface LayoutNode {
  type: string;
  value?: string;
  box?: { left: number; top: number; width: number; height: number };
  lines?: Array<{ ascent: number; descent: number; xAdvance: number; overflowRight?: number }>;
  children?: LayoutNode[];
}

test('Blue Line contact icons use CSS pixel sizes and align with visible text', async () => {
  const data = { ...defaultResume, info: { ...defaultResume.info,
    fullName: 'Example', headline: 'Frontend Engineer', phoneNumber: '13800000000',
    email: 'example@example.com', address: 'Beijing, China', website: 'https://example.com',
  } };
  let layout: LayoutNode | undefined;
  await renderToBuffer(React.cloneElement(MagicResumePdfDocument({ data, template: blueLineTemplate }), {
    onRender: (result: unknown) => { layout = (result as { _INTERNAL__LAYOUT__DATA_: LayoutNode })._INTERNAL__LAYOUT__DATA_; },
  }));
  assert.ok(layout);
  const positioned: Array<{ node: LayoutNode; x: number; y: number }> = [];
  const visit = (node: LayoutNode, x = 0, y = 0) => {
    x += node.box?.left ?? 0;
    y += node.box?.top ?? 0;
    positioned.push({ node, x, y });
    for (const child of node.children ?? []) visit(child, x, y);
  };
  visit(layout);
  for (const field of ['phoneNumber', 'email', 'address', 'website'] as const) {
    const text = positioned.find(({ node }) => node.type === 'TEXT' &&
      node.children?.some((child) => child.value === data.info[field]));
    assert.ok(text?.node.box && text.node.lines?.[0], `${field}: missing measured text`);
    const icon = positioned.find(({ node, x, y }) => node.type === 'SVG' && x < text.x &&
      Math.abs(y - text.y) < 10);
    assert.ok(icon?.node.box, `${field}: missing contact icon`);
    assert.ok(Math.abs(icon.node.box.width - 12) < 0.1, `${field}: 16 CSS px must become 12 PDF pt`);
    const line = text.node.lines[0];
    const textCenter = text.y + (line.ascent - line.descent) / 2;
    const iconCenter = icon.y + icon.node.box.height / 2;
    assert.ok(Math.abs(iconCenter - textCenter) < 1, `${field}: icon is vertically offset by ${iconCenter - textCenter}pt`);
  }
});

for (const width of [794, 600]) {
  test(`Blue Line wraps long contacts within their columns at ${width}px`, async () => {
    const longUrl = `https://example.com/${'collaborative-resume-editor-'.repeat(12)}`;
    const data = { ...defaultResume, sections: {}, sectionOrder: [], info: { ...defaultResume.info,
      fullName: 'Example', headline: 'Frontend Engineer', phoneNumber: '13800000000',
      email: `${'long-email-'.repeat(8)}@example.com`,
      address: 'No. 29, Xueyuan Road, Haidian District, Beijing, China · 长地址换行验证',
      website: `${longUrl}website`,
      customFields: [
        { id: 'long-contact', name: '技术博客与开源作品集', value: `${longUrl}custom`, icon: 'globe' },
        { id: 'long-label', name: 'Very long custom contact label '.repeat(4), value: 'https://example.com/short' },
      ],
    } };
    const template = { ...blueLineTemplate, layout: { ...blueLineTemplate.layout, containerWidth: `${width}px` } };
    let layout: LayoutNode | undefined;
    await renderToBuffer(React.cloneElement(MagicResumePdfDocument({ data, template }), {
      onRender: (result: unknown) => { layout = (result as { _INTERNAL__LAYOUT__DATA_: LayoutNode })._INTERNAL__LAYOUT__DATA_; },
    }));
    assert.ok(layout);
    const positioned: Array<{ node: LayoutNode; x: number; y: number }> = [];
    const visit = (node: LayoutNode, x = 0, y = 0) => {
      x += node.box?.left ?? 0;
      y += node.box?.top ?? 0;
      positioned.push({ node, x, y });
      for (const child of node.children ?? []) visit(child, x, y);
    };
    visit(layout);
    const middle = width * 0.75 / 2;
    const contentRight = (width - 44) * 0.75;
    const textOf = (node: LayoutNode): string => node.value ?? (node.children ?? []).map(textOf).join('');
    for (const [side, value] of [
      ['left', data.info.email], ['left', data.info.address], ['right', data.info.website],
      ...data.info.customFields.map((field) => ['right', field.value]),
      ...data.info.customFields.map((field) => ['right', `${field.name}：`]),
    ]) {
      const text = positioned.find(({ node }) => node.type === 'TEXT' && textOf(node) === value);
      assert.ok(text?.node.box && text.node.lines?.length, `missing contact: ${side}`);
      if (side === 'left') {
        assert.ok(text.x + text.node.box.width <= middle, 'left contact crosses into the right column');
      } else {
        assert.ok(text.x >= middle, 'right contact crosses into the left column');
        assert.ok(text.x + text.node.box.width <= contentRight + 0.1, 'right contact exceeds the content margin');
      }
      for (const line of text.node.lines) {
        // textkit permits hanging trailing whitespace; it paints no visible glyphs.
        const visibleWidth = line.xAdvance - (line.overflowRight ?? 0);
        assert.ok(visibleWidth <= text.node.box.width + 0.5,
          `contact glyphs overflow: ${visibleWidth}pt > ${text.node.box.width}pt`);
      }
      if (value.includes('collaborative-resume-editor-')) {
        assert.ok(text.node.lines.length > 1, 'long URLs must wrap instead of being truncated');
      }
    }
    for (const { node } of positioned.filter(({ node }) => node.type === 'SVG')) {
      assert.ok(node.box && node.box.width >= 11.25 && node.box.width <= 12,
        'long text must not shrink the contact icons');
    }
  });
}
