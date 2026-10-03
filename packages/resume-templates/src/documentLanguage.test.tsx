import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultResume } from '@magic-resume/resume-schema';
import { resolveSectionTitle } from './sectionSemantics';
import { MagicResumeRenderer } from './renderer/MagicResumeRenderer';
import { MagicResumePdfDocument } from './pdf/MagicResumePdfDocument';
import { magicTemplates } from './config/magic-templates';
import { localizeDocumentTree } from './primitives/localizeDocumentTree';
import type { ResolvedNode } from './primitives/ir';

const resume = {
  ...defaultResume,
  documentLanguage: 'en' as const,
  sectionOrder: [{ key: 'projects', label: 'sections.projects' }],
  sections: {
    ...defaultResume.sections,
    projects: [
      {
        id: 'p1',
        name: 'Example',
        summary: '<p>Built a useful application.</p>',
        visible: true,
      },
    ],
  },
};
test('document language beats UI locale and default Chinese template titles', () => {
  assert.equal(
    resolveSectionTitle('projects', 'Projects', resume, 'zh', '项目经历'),
    'Projects',
  );
  assert.equal(
    resolveSectionTitle(
      'projects',
      'Projects',
      { ...resume, documentLanguage: 'ja' },
      'en',
    ),
    'プロジェクト',
  );
});
test('user headings survive language and template changes, reset restores the default', () => {
  const custom = {
    ...resume,
    sectionOrder: [
      { key: 'projects', label: 'sections.projects', title: '开源贡献' },
    ],
  };
  assert.equal(
    resolveSectionTitle('projects', 'Portfolio', custom, 'en'),
    '开源贡献',
  );
  assert.equal(
    resolveSectionTitle('projects', 'Portfolio', {
      ...custom,
      documentLanguage: 'fr',
    }),
    '开源贡献',
  );
  assert.equal(
    resolveSectionTitle('projects', 'Portfolio', resume),
    'Projects',
  );
  assert.equal(
    resolveSectionTitle('custom', 'Section', {
      ...resume,
      sectionOrder: [{ key: 'custom', label: 'Research & Publications' }],
    }),
    'Research & Publications',
  );
});
test('HTML and PDF render English headings in a Chinese UI, including explicit overrides', () => {
  for (const title of [undefined, 'Selected Work']) {
    const data = {
      ...resume,
      sectionOrder: [{ key: 'projects', label: 'sections.projects', title }],
    };
    for (const Renderer of [MagicResumeRenderer, MagicResumePdfDocument]) {
      const html = renderToStaticMarkup(
        <Renderer template={magicTemplates.classic} data={data} locale="zh" />,
      );
      assert.ok(html.includes(title ?? 'Projects'));
      assert.ok(!html.includes('项目经历'));
    }
  }
});
test('semantic template trees localize heading and editor metadata together', () => {
  const root: ResolvedNode = {
    type: 'Box',
    instanceId: 'section',
    templateNodeId: 'section',
    style: {},
    editor: { sectionKey: 'projects', title: '项目经历' },
    children: [
      {
        type: 'Text',
        instanceId: 'title',
        templateNodeId: 'title',
        style: {},
        role: 'sectionHeading',
        text: '项目经历',
      },
    ],
  };
  const localized = localizeDocumentTree(root, resume, 'zh');
  assert.equal(localized.type === 'Box' && localized.editor?.title, 'Projects');
  assert.equal(
    localized.type === 'Box' &&
      localized.children[0].type === 'Text' &&
      localized.children[0].text,
    'Projects',
  );
  assert.equal(
    root.children[0].type === 'Text' && root.children[0].text,
    '项目经历',
  );
});
