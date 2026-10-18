import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blueLineTemplate } from '../../config/blue-line-template';
import type { TemplateDocument } from '../ast';
import { compile } from '../compile';
import type { ResolvedNode } from '../ir';
import { validateTemplate } from '../validate';
import { resolveTreeTemplateStyles } from '../templateStyles';

const nodesOf = (node: ResolvedNode | null): ResolvedNode[] =>
  node ? [node, ...(node.type === 'Box' ? node.children.flatMap(nodesOf) : [])] : [];

const compileComponent = (binding: string, data: Record<string, unknown>) => {
  const component = blueLineTemplate.components.find((item) => item.dataBinding === binding);
  assert.ok(component, `Missing component for ${binding}`);
  assert.equal(component.type, 'Tree');
  const tree = component.tree as TemplateDocument;
  assert.equal(validateTemplate(tree).ok, true);
  const result = compile(tree, data);
  assert.ok(result.root, JSON.stringify(result.diagnostics));
  assert.equal(result.diagnostics.filter((item) => item.level === 'error').length, 0);
  return nodesOf(result.root);
};

test('Blue Line has separate data-bound trees for every standard section', () => {
  assert.equal(blueLineTemplate.id, 'blue-line');
  assert.equal(blueLineTemplate.status, 'PUBLISHED');
  assert.equal(blueLineTemplate.layout.containerWidth, '794px');
  assert.equal(blueLineTemplate.designTokens.colors.primary, '#0879ee');
  assert.deepEqual(blueLineTemplate.components.map((item) => item.dataBinding), [
    'info', 'sections.education', 'sections.skills', 'sections.experience', 'sections.projects', 'sections.openSource',
    'sections.summary', 'sections.personalEvaluation', 'sections.profiles', 'sections.languages', 'sections.awards', 'sections.certificates',
  ]);
});

test('Blue Line responds to the heading and body font controls used by TemplatePanel', () => {
  assert.equal(blueLineTemplate.designTokens.typography.fontSize.lg, '21px');
  assert.equal(blueLineTemplate.designTokens.typography.fontSize.sm, '13.2px');
  assert.equal(blueLineTemplate.designTokens.typography.fontSize.md, '14.4px');
  const template = structuredClone(blueLineTemplate);
  template.designTokens.typography.fontSize.lg = '24px';
  template.designTokens.typography.fontSize.sm = '18px';
  const tree = template.components.find((item) => item.dataBinding === 'sections.experience')?.tree as TemplateDocument;
  const result = compile(resolveTreeTemplateStyles(tree, template), {
    info: {}, sectionOrder: [], sections: { experience: [{ id: 'exp', company: '示例科技', summary: '<p>正文</p>' }] },
  });
  const nodes = nodesOf(result.root);
  assert.equal(nodes.find((node) => node.type === 'Text' && node.role === 'sectionHeading')?.style.fontSize, 24);
  assert.equal(nodes.find((node) => node.type === 'RichText')?.style.fontSize, 18);
});

test('Blue Line header uses the target role, links, and custom contacts with a name fallback', () => {
  const data = {
    info: {
      fullName: '陈予安', headline: '前端开发工程师', phoneNumber: '13800000000',
      email: 'chen@example.com', address: '杭州', website: 'https://example.com',
      customFields: [{ id: 'github', name: 'GitHub', value: 'https://github.com/example', icon: 'github' }],
    }, sections: {}, sectionOrder: [],
  };
  const nodes = compileComponent('info', data);
  const texts = nodes.filter((node) => node.type === 'Text');
  assert.equal(texts.find((node) => node.role === 'title')?.text, '前端开发工程师');
  for (const expected of ['陈予安', '13800000000', 'chen@example.com', '杭州', 'https://example.com', 'https://github.com/example']) {
    assert.ok(texts.some((node) => node.text === expected), expected);
  }
  assert.ok(nodes.some((node) => node.href === 'https://example.com'));
  assert.ok(nodes.some((node) => node.type === 'Icon' && node.name === 'location'));
  for (const node of nodes.filter((item) => item.href || item.type === 'Icon')) {
    assert.equal(node.style.color, 'var(--color-text-secondary)', `${node.templateNodeId}: explicit contact color`);
    if (node.href) assert.equal(node.style.textDecoration, 'none');
  }
  const fallback = compileComponent('info', { ...data, info: { fullName: '陈予安' } });
  assert.equal(fallback.filter((node) => node.type === 'Text').find((node) => node.role === 'title')?.text, '陈予安');
  assert.equal(fallback.filter((node) => node.type === 'Icon').length, 0);
});

test('Blue Line keeps editable entry fields, rich text, custom fields, and item visibility', () => {
  const nodes = compileComponent('sections.experience', {
    info: {}, sectionOrder: [], sections: { experience: [
      { id: 'exp-1', visible: true, company: '示例科技', position: '工程师', date: '2024–2026', website: 'https://example.com/company',
        summary: '<p>设计组件系统</p>', description: '<p>旧版描述</p>',
        customFields: [{ id: 'field-1', name: '团队', value: '基础平台' }] },
      { id: 'exp-hidden', visible: false, company: '隐藏公司' },
    ] },
  });
  const company = nodes.find((node) => node.type === 'Text' && node.text === '示例科技');
  assert.ok(company && company.type === 'Text');
  assert.equal(company.edit?.itemId, 'exp-1');
  assert.equal(company.edit?.fieldKey, 'company');
  assert.equal(company.edit?.sectionKey, 'experience');
  assert.ok(nodes.some((node) => node.href === 'https://example.com/company'));
  const summary = nodes.find((node) => node.type === 'RichText');
  assert.ok(summary && summary.type === 'RichText');
  assert.equal(summary.html, '<p>设计组件系统</p>');
  assert.equal(summary.edit?.fieldKey, 'summary');
  const customValue = nodes.find((node) => node.type === 'Text' && node.text === '基础平台');
  assert.ok(customValue && customValue.type === 'Text');
  assert.equal(customValue.edit, undefined, 'Nested custom values remain read-only rather than targeting a section item');
  assert.equal(customValue.style.color, 'var(--color-text-secondary)');
  assert.equal(customValue.style.textDecoration, 'none');
  assert.equal(nodes.some((node) => node.type === 'Text' && node.text === '隐藏公司'), false);
  assert.ok(nodes.some((node) => node.type === 'Box' && node.editor?.handle));
  assert.ok(nodes.some((node) => node.type === 'Box' && node.editor?.insertSlot));
});

test('Blue Line supplements all sections using the product fields and binds optional details', () => {
  const sections = {
    education: [{ id: 'ed', school: '示例大学', degree: '学士', major: '计算机科学', date: '2020–2024', location: '杭州', gpa: '3.8/4.0', summary: '<p>课程项目</p>' }],
    skills: [{ id: 'sk', name: 'TypeScript', level: '熟练', summary: '<p>类型系统</p>' }],
    projects: [{ id: 'pr', name: '协作工具', role: '前端负责人', date: '2025', link: 'https://example.com/project', technologies: 'React、TypeScript', summary: '<p>协同编辑</p>' }],
    openSource: [{ id: 'os', name: '开源工具', role: '维护者', date: '2026', link: 'https://example.com/open-source', technologies: 'TypeScript', summary: '<p>开源协作</p>' }],
    summary: [{ id: 'su', summary: '<p>重视工程质量</p>' }],
    personalEvaluation: [{ id: 'pe', summary: '<p>持续学习与合作</p>' }],
    profiles: [{ id: 'pf', platform: 'GitHub', username: 'example', url: 'https://github.com/example', summary: '<p>开源记录</p>' }],
    languages: [{ id: 'la', language: '英语', level: '专业工作能力', summary: '<p>技术交流</p>' }],
    certificates: [{ id: 'ce', certificate: '示例认证', issuer: '示例机构', date: '2025', summary: '<p>云计算认证</p>' }],
    awards: [{ id: 'aw', title: '示例奖项', issuer: '示例组织', date: '2025', summary: '<p>工程实践奖</p>' }],
  };
  for (const [key, items] of Object.entries(sections)) {
    const nodes = compileComponent(`sections.${key}`, { info: {}, sections, sectionOrder: [] });
    const body = nodes.filter((node) => node.type === 'RichText');
    assert.equal(body.length, 1, `${key}: missing rich text`);
    if (key === 'projects' || key === 'openSource') {
      assert.ok(nodes.some((node) => node.href && node.style.textDecoration === 'none'), `${key}: undecorated title link`);
    }
    for (const [field, value] of Object.entries(items[0])) {
      if (field === 'id' || field === 'summary' || field === 'link' || field === 'url') continue;
      assert.ok(nodes.some((node) => node.type === 'Text' && node.text === value), `${key}.${field}: ${value}`);
    }
  }
});
