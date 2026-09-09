import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MagicResumeRenderer } from '../renderer/MagicResumeRenderer';
import { magicTemplates } from '../config/magic-templates';
import type { Resume } from '../types/resume';
import type { TemplateDocument } from './ast';
import { UNHANDLED_SECTIONS } from './compile';

/**
 * `templateOverride` 接管整份简历的渲染。
 *
 * 这些用例走的是**真正的对外入口** `MagicResumeRenderer`，不是编译器——
 * 因为要验的正是「接管」这个分支本身：判断放对了没有、坏数据会不会白屏。
 */

const template = Object.values(magicTemplates)[0];

const resume = {
  id: 'r1',
  name: '测试',
  info: { fullName: '张三' },
  sections: {
    experience: [{ id: 'e1', company: '甲公司' }],
    education: [{ id: 'd1', school: '某大学' }],
  },
  sectionOrder: [{ key: 'experience' }, { key: 'education' }],
  template: 'classic',
  themeColor: '#000',
  typography: 'sans',
} as unknown as Resume;

const tree: TemplateDocument = {
  version: 1,
  root: {
    id: 'root',
    type: 'Box',
    children: [
      { id: 'name', type: 'Text', role: 'title', value: { read: 'info.fullName' } },
      { id: 'exp', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
      { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
    ],
  },
};

const render = (data: Resume): string =>
  renderToStaticMarkup(
    React.createElement(MagicResumeRenderer, { template, data, locale: 'zh' }),
  );

test('没有 override 时走 legacy 路径', () => {
  const html = render(resume);
  assert.ok(html.includes('张三'));
  // legacy 组件带 Tailwind 类名；原语树只出内联样式，靠这个能区分走了哪条路。
  assert.ok(html.includes('class='), '应该看得到 legacy 组件的类名');
});

test('有 override 时整份简历由树接管', () => {
  const html = render({ ...resume, templateOverride: tree });
  assert.ok(html.includes('张三'));
  assert.ok(html.includes('甲公司'));
  assert.ok(html.includes('data-template-node="root"'), '应该看得到原语树的节点标记');
});

/**
 * 兜底节点接住**用户自建**的分区——否则那一块静默消失。
 *
 * 注意它接不住内建分区（experience/education/…）：`resolveEachItems` 对
 * `$unhandledSections` 显式跳过了那七个 key，因为在 legacy 世界里「模板没声明内建分区」
 * 被视为有意省略，自动合成反而会把 i18n key 印在纸上。
 * 这个语义差别正是 `replicate.ts` 的覆盖检查要分两档的原因。
 */
test('override 里的兜底节点接住了用户自建的分区', () => {
  const withCustom = {
    ...resume,
    sections: { ...resume.sections, 获奖经历: [{ id: 'a1', name: '优秀员工' }] },
    sectionOrder: [...(resume.sectionOrder as unknown[]), { key: '获奖经历' }],
  } as unknown as Resume;
  const html = render({ ...withCustom, templateOverride: tree });
  assert.ok(html.includes('获奖经历'), '自建分区应由兜底节点接住');
});

test('已保存的旧 override 也会在自定义标题前补上选中的图标', () => {
  const legacyHeadingTree: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      children: [
        {
          id: 'rest',
          type: 'Box',
          each: { path: UNHANDLED_SECTIONS },
          children: [
            {
              id: 'rest-h',
              type: 'Box',
              section: { sectionKey: '{{item.key}}', title: '{{item.key}}' },
              children: [{ id: 'rest-title', type: 'Text', value: '{{item.key}}' }],
            },
          ],
        },
      ],
    },
  };
  const withCustom = {
    ...resume,
    sections: { ...resume.sections, custom: [{ id: 'c1', name: '内容' }] },
    sectionOrder: [...(resume.sectionOrder as unknown[]), { key: 'custom', icon: 'target' }],
  } as unknown as Resume;
  const html = render({ ...withCustom, templateOverride: legacyHeadingTree });
  assert.ok(html.includes('data-section-title-icon="target"'));
});

/**
 * **坏树不能白屏。** 模板树是 AI 生成、存在用户简历上的数据——它一定会有坏的时候。
 * 坏了要退化成「这一块没画出来」，而不是整个编辑器崩掉。
 */
test('坏掉的 override 不白屏也不抛', () => {
  for (const bad of [null, 'x', 42, [], {}, { version: 2 }, { version: 1, root: { id: 'r', type: 'Nope' } }]) {
    assert.doesNotThrow(() => {
      const html = render({ ...resume, templateOverride: bad });
      assert.equal(typeof html, 'string');
    }, `override=${JSON.stringify(bad)} 时抛了`);
  }
});

/**
 * `null` / `undefined` / `false` 都要当成「没有 override」，回落到 legacy。
 * 这条容易写错成 `'templateOverride' in data`，那样一个 `null` 就会让简历变空白。
 */
test('override 为空值时回落到 legacy 而不是渲染空白', () => {
  for (const empty of [undefined, null, false, '']) {
    const html = render({ ...resume, templateOverride: empty });
    assert.ok(html.includes('张三'), `override=${JSON.stringify(empty)} 时简历空了`);
  }
});
