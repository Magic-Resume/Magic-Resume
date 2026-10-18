import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { templateSchema } from '@magic-resume/resume-schema';
import { getTemplateById, getTemplateManifestById } from '../registry';
import { MagicResumeRenderer } from '../renderer/MagicResumeRenderer';
import { MagicResumePdfDocument } from '../pdf/MagicResumePdfDocument';
import type { Resume } from '../types/resume';

const resume = {
  name: 'Fictional template check',
  info: { fullName: '林知远', headline: '前端开发工程师', email: 'lin@example.com', customFields: [] },
  sections: {
    education: [{ id: 'edu', school: '示例大学', visible: true }],
    experience: [{ id: 'exp', company: '星河科技', visible: true, summary: '<p>可编辑的经历正文</p>' }],
    projects: [{ id: 'hidden-project', name: '不应显示的项目', visible: false }],
  },
  sectionOrder: [{ key: 'experience', label: '工作经历' }, { key: 'education', label: '教育经历' }, { key: 'projects', label: '项目经历' }],
  template: 'blue-line',
  themeColor: '#0879ee',
  typography: 'Source Han Sans SC',
  documentLanguage: 'zh',
} as unknown as Resume;

test('blue-line is accepted by the shared schema and exposed by the registry', () => {
  assert.equal(templateSchema.safeParse('blue-line').success, true);
  assert.equal(getTemplateById('blue-line').id, 'blue-line');
  assert.equal(getTemplateManifestById('blue-line').thumbnailUrl, '/templates/jpg/blue-line.jpg');
});

test('blue-line preserves section order and skips hidden-only sections in HTML and PDF', () => {
  const template = getTemplateById('blue-line');
  assert.equal(template.id, 'blue-line');
  const html = renderToStaticMarkup(<MagicResumeRenderer template={template} data={resume} />);
  const pdf = renderToStaticMarkup(MagicResumePdfDocument({ template, data: resume }));
  for (const output of [html, pdf]) {
    assert.ok(output.indexOf('星河科技') < output.indexOf('示例大学'));
    assert.doesNotMatch(output, /不应显示的项目|项目经历/);
    assert.match(output, /前端开发工程师/);
  }
  // 网页富文本由浏览器清洗后填入；PDF 在服务端直接生成正文。
  assert.match(pdf, /可编辑的经历正文/);
});

test('blue-line applies the same custom color and body size to HTML and PDF', () => {
  const template = structuredClone(getTemplateById('blue-line'));
  assert.equal(template.id, 'blue-line');
  template.designTokens.colors.primary = '#a12345';
  template.designTokens.typography.fontSize.sm = '18px';
  template.designTokens.typography.fontSize.lg = '24px';
  const html = renderToStaticMarkup(<MagicResumeRenderer template={template} data={resume} />);
  const pdf = renderToStaticMarkup(MagicResumePdfDocument({ template, data: resume }));
  assert.match(html, /color:#a12345/);
  assert.match(pdf, /color:#a12345/);
  assert.match(html, /font-size:18px/);
  assert.match(html, /<h2[^>]*font-size:24px/);
  assert.match(pdf, /font-size:13\.5px/);
  assert.match(pdf, /font-size:18px[^>]*>工作经历/);
});

test('blue-line localizes every section for English documents and preserves explicit headings', () => {
  const titles = {
    education: 'Education', skills: 'Skills', experience: 'Work Experience', projects: 'Projects',
    openSource: 'Open Source Contributions', summary: 'Summary', personalEvaluation: 'Self Assessment',
    profiles: 'Links', languages: 'Languages', awards: 'Awards', certificates: 'Certifications',
  };
  const data: Resume = {
    ...resume,
    documentLanguage: 'en',
    sections: Object.fromEntries(Object.keys(titles).map((key) => [key, [
      { id: key, visible: true, name: 'Example', summary: '<p>Example content.</p>' },
    ]])),
    sectionOrder: Object.keys(titles).map((key) => ({ key, label: `sections.${key}` })),
  };
  const template = getTemplateById('blue-line');
  for (const Renderer of [MagicResumeRenderer, MagicResumePdfDocument]) {
    const output = renderToStaticMarkup(<Renderer template={template} data={data} locale="zh" />);
    for (const title of Object.values(titles)) assert.ok(output.includes(title), `Missing English heading: ${title}`);
    assert.doesNotMatch(output, /开源贡献|个人评价/);
    const custom = { ...data, sectionOrder: [{ key: 'openSource', label: 'sections.openSource', title: 'Selected Community Work' }] };
    const customized = renderToStaticMarkup(<Renderer template={template} data={custom} locale="zh" />);
    assert.ok(customized.includes('Selected Community Work'));
  }
});
