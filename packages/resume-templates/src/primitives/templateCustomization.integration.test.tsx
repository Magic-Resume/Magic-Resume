import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultResume } from '@magic-resume/resume-schema';
import { getTemplateById } from '../registry';
import { MagicResumeRenderer } from '../renderer/MagicResumeRenderer';
import { MagicResumePdfDocument } from '../pdf/MagicResumePdfDocument';
import type { Resume } from '../types/resume';
import type { TemplateDocument } from './ast';
import { compileTreeComponent } from './treeComponent';

const resume: Resume = {
  ...defaultResume,
  info: { ...defaultResume.info, fullName: '林知远', headline: '前端开发工程师' },
  template: 'classic',
  documentLanguage: 'zh',
};

test('primitive styles resolve customized design tokens without mutating the saved tree', () => {
  const template = structuredClone(getTemplateById('classic'));
  template.designTokens.colors.primary = '#a12345';
  template.designTokens.typography.fontSize.md = '18px';
  template.designTokens.spacing.md = '1.5rem';
  template.layout.showTitleDivider = false;
  const tree: TemplateDocument = {
    version: 1,
    styles: { body: { color: 'var(--color-primary)', fontSize: 'var(--font-size-md)', gap: 'var(--spacing-md)', borderBottomWidth: 'var(--title-divider-width)' } },
    root: { id: 'body', type: 'Box', style: ['body'], children: [{ id: 'name', type: 'Text', value: { read: 'info.fullName' } }] },
  };
  const root = compileTreeComponent(tree, resume as unknown as Record<string, unknown>, 'tokens', 'zh', template);
  assert.ok(root);
  assert.equal(root.style.color, '#a12345');
  assert.equal(root.style.fontSize, 18);
  assert.equal(root.style.gap, 24);
  assert.equal(root.style.borderBottomWidth, 0);
  assert.equal(tree.styles?.body.color, 'var(--color-primary)');
});

test('malformed saved styles cannot crash tree rendering when theme tokens are applied', () => {
  const tree = {
    version: 1,
    root: { id: 'name', type: 'Text', value: { read: 'info.fullName' }, style: { color: '#000' } },
  };
  assert.doesNotThrow(() => compileTreeComponent(tree, {}, 'invalid-styles', 'zh', getTemplateById('classic')));
});

test('the template title-icon setting does not affect contact icons or saved section choices', () => {
  const template = structuredClone(getTemplateById('classic'));
  template.layout.showTitleIcon = false;
  const data = { ...resume, sectionOrder: [{ key: 'experience', label: '工作经历', icon: 'briefcase' }] };
  const tree: TemplateDocument = {
    version: 1,
    root: {
      id: 'section', type: 'Box', section: { sectionKey: 'experience', handle: true },
      children: [{ id: 'title', type: 'Text', role: 'sectionHeading', value: 'Experience' }],
    },
  };
  const root = compileTreeComponent(tree, data as unknown as Record<string, unknown>, 'icons', 'zh', template);
  assert.ok(root?.type === 'Box');
  assert.equal(root.editor?.icon, undefined);
  assert.equal(data.sectionOrder[0].icon, 'briefcase');
});

test('root info bindings preserve headline editing and never produce nested write paths', () => {
  const tree: TemplateDocument = {
    version: 1,
    root: { id: 'header', type: 'Box', children: [
      { id: 'headline', type: 'Text', value: { read: 'info.headline' } },
      { id: 'nested-contact', type: 'Text', value: { read: 'info.customFields.0.value' } },
    ] },
  };
  const root = compileTreeComponent(tree, {
    info: { headline: '前端开发工程师', customFields: [{ id: 'github', value: 'example.com' }] },
  }, 'header');
  assert.ok(root?.type === 'Box');
  const headline = root.children.find((node) => node.templateNodeId === 'headline');
  const nested = root.children.find((node) => node.templateNodeId === 'nested-contact');
  assert.ok(headline && headline.type === 'Text');
  assert.equal(headline.edit?.sectionKey, 'info');
  assert.equal(headline.edit?.fieldKey, 'headline');
  assert.ok(nested && nested.type === 'Text');
  assert.equal(nested.edit, undefined);
});

test('a saved section icon does not duplicate explicitly declared sections in PDF', () => {
  const data = {
    ...resume,
    sections: { education: [{ id: 'edu', visible: true, school: 'UniqueSchoolEntry' }] },
    sectionOrder: [{ key: 'education', label: '教育经历', icon: 'briefcase' }],
  } as Resume;
  const template = getTemplateById('classic');
  const html = renderToStaticMarkup(<MagicResumeRenderer template={template} data={data} />);
  const pdf = renderToStaticMarkup(MagicResumePdfDocument({ template, data }));
  assert.equal(html.split('UniqueSchoolEntry').length - 1, 1);
  assert.equal(pdf.split('UniqueSchoolEntry').length - 1, 1);
});
