/**
 * Does a custom section actually reach the page?
 *
 * This guards both sides of the custom-section contract: an undeclared section
 * must still reach every template/export, and optional item fields must remain
 * visible when present without affecting built-in sections.
 *
 * Run: pnpm verify:sections
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { join } from 'node:path';

import { templateRegistry } from '../../../packages/resume-templates/src/registry';
import { MagicResumeRenderer } from '../../../packages/resume-templates/src/renderer/MagicResumeRenderer';
import { MagicResumePdfDocument } from '../../../packages/resume-templates/src/pdf/MagicResumePdfDocument';

const CUSTOM_HEADING = '个人优势';
const LEGACY_ITEM_NAME = '综合能力';
const CUSTOM_FIELD_NAME = '获奖等级';
const CUSTOM_FIELD_VALUE = '国赛三等奖';
const CUSTOM_DATE = '2024.06';
const DESCRIPTION_TEXT = '熟练使用 Claude Code、Cursor、Codex';
const SKILL_NAME = 'TypeScript';
const LANGUAGE_NAME = '英语';

/** A resume shaped like the one that exposed all of this. */
const resume = {
  id: 'verify-1',
  name: 'verify',
  updatedAt: 1,
  info: {
    fullName: '张三',
    headline: '高级前端工程师',
    email: 'a@b.c',
    phoneNumber: '13800000000',
    address: '上海',
    website: '',
    avatar: '',
  },
  sections: {
    experience: [
      { id: 'e1', visible: true, company: '某公司', position: '前端', date: '2021 - 2024', summary: '<p>正文</p>' },
    ],
    // Built-ins many templates render in their SIDEBAR — the case that made
    // every one of them look undeclared and get duplicated into the main column.
    skills: [{ id: 's1', visible: true, name: SKILL_NAME, level: '熟练' }],
    languages: [{ id: 'l1', visible: true, name: LANGUAGE_NAME, level: 'CET-6' }],
    // The section the app never defined.
    personalStrengths: [
      {
        id: 'ps1',
        visible: true,
        name: LEGACY_ITEM_NAME,
        date: CUSTOM_DATE,
        summary: '<ul><li>熟练使用 Claude Code、Cursor、Codex</li><li>英语 CET-4、CET-6</li></ul>',
        customFields: [
          { id: 'cf1', name: CUSTOM_FIELD_NAME, value: CUSTOM_FIELD_VALUE },
        ],
      },
    ],
  },
  sectionOrder: [
    { key: 'basics', label: 'Basics' },
    { key: 'experience', label: '工作经历' },
    // Built-in labels are i18n keys, which is what got printed as a heading.
    { key: 'skills', label: 'sections.skills' },
    { key: 'languages', label: 'sections.languages' },
    { key: 'personalStrengths', label: CUSTOM_HEADING, icon: 'trophy' },
  ],
  template: 'classic',
  themeColor: '#f97316',
  typography: 'inter',
};

const stripTags = (html: string) => html.replace(/<[^>]*>/g, '');

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

async function main() {
  console.log('HTML renderer, every template:');
  for (const [id, manifest] of Object.entries(templateRegistry)) {
    const html = renderToStaticMarkup(
      React.createElement(MagicResumeRenderer, {
        template: manifest.template,
        data: { ...resume, template: id },
        locale: 'zh-CN',
      }),
    );
    const text = stripTags(html);

    const problems = [];
    if (!text.includes(CUSTOM_HEADING)) problems.push('缺标题');
    if (!text.includes(LEGACY_ITEM_NAME)) problems.push('缺自定义条目标题');
    if (!text.includes(CUSTOM_DATE)) problems.push('缺自定义条目时间');
    if (!text.includes(CUSTOM_FIELD_NAME) || !text.includes(CUSTOM_FIELD_VALUE)) problems.push('缺自定义字段');
    // The section it always had must not have been disturbed.
    if (!text.includes('某公司')) problems.push('内置段落丢失');
    // A sidebar-rendered built-in used to be synthesised a second time into the
    // main column, headed with its raw i18n key.
    const occurrences = (needle: string) => text.split(needle).length - 1;
    if (occurrences(SKILL_NAME) > 1) problems.push('技能重复渲染');
    if (occurrences(LANGUAGE_NAME) > 1) problems.push('语言重复渲染');
    if (text.includes('sections.')) problems.push('标题打印了 i18n key');
    // Rich text (`summary`) is deliberately not asserted here: WysiwygContent
    // returns an empty div when there is no DOM, because DOMPurify needs one.
    // That is true of every section, built-in or custom, so it says nothing
    // about this change — and asserting it would need jsdom in a package that
    // otherwise has no test runner.

    check(id, problems.length === 0, problems.join('、'));
  }

  // The app registers these at runtime from `public/fonts` (see pdf/browser.tsx),
  // which needs `window.location`. Register the same files from disk so the
  // exporter can lay out a page here.
  const FONT_DIR = join(import.meta.dirname, '..', 'public', 'fonts');
  for (const family of ['Source Han Serif SC', 'Source Han Sans SC']) {
    const file = family.includes('Serif')
      ? 'SourceHanSerifSC-Regular.woff2'
      : 'SourceHanSansSC-Regular.woff2';
    Font.register({ family, src: join(FONT_DIR, file) });
  }

  console.log('\nPDF exporter (classic):');
  const buffer = await renderToBuffer(
    React.createElement(MagicResumePdfDocument, {
      data: resume,
      template: templateRegistry.classic.template,
      locale: 'zh-CN',
      // Latin-only: the CJK stack is registered by `pdf/browser.tsx` at runtime,
      // which fetches font files. The question here is whether the section is in
      // the document at all, not how its glyphs are shaped.
      cjkFallback: false,
      // `MagicResumePdfDocument` renders a <Document>, but its own props type is
      // not `DocumentProps` — which is all `renderToBuffer`'s signature knows.
    }) as React.ReactElement<DocumentProps>,
  );
  // Read the text back out rather than trusting the byte count: a document that
  // merely grew could have grown for any reason, and the failure this guards
  // against is content quietly missing.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let pdfText = '';
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    pdfText += content.items.map((item: unknown) =>
    item && typeof item === 'object' && 'str' in item ? String((item as { str: unknown }).str) : '',
  ).join('');
  }
  pdfText = pdfText.replace(/\s/g, '');

  check('heading is in the export', pdfText.includes(CUSTOM_HEADING));
  check('description is in the export', pdfText.includes(DESCRIPTION_TEXT.replace(/\s/g, '')));
  check('item title is in the export', pdfText.includes(LEGACY_ITEM_NAME));
  check('item date is in the export', pdfText.includes(CUSTOM_DATE));
  check(
    'custom fields are in the export',
    pdfText.includes(CUSTOM_FIELD_NAME) && pdfText.includes(CUSTOM_FIELD_VALUE),
  );
  check('built-in sections still export', pdfText.includes('某公司'));

  console.log(
    failures === 0
      ? '\n全部通过'
      : `\n${failures} 项失败`,
  );
  process.exit(failures === 0 ? 0 : 1);

}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
