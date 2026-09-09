import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TemplateDocument, TemplateNode } from './ast';
import { compile } from './compile';
import { normalizeStyles } from './normalize';
import { defaultSectionPreset } from './presets/defaultSection';

const resume = {
  info: { fullName: '张三' },
  sections: {
    experience: [
      { id: 'e1', company: '甲公司', date: '2023 - 至今', summary: '<p>做了 A</p>' },
      { id: 'e2', company: '乙公司', date: '2021 - 2023' },
    ],
  },
  sectionOrder: [{ key: 'experience' }],
};

const bold = { fontWeight: 700 };
const gray = { color: '#71717a' };

const repeated = (): TemplateDocument => ({
  version: 1,
  root: {
    id: 'wrap',
    type: 'Box',
    children: [
      { id: 'a', type: 'Text', value: { read: 'info.fullName' }, style: [bold] },
      { id: 'b', type: 'Text', value: '标题', style: [{ fontWeight: 700 }] },
      { id: 'c', type: 'Text', value: '副标题', style: [{ fontWeight: 700 }] },
      { id: 'd', type: 'Text', value: '只出现一次', style: [gray] },
    ],
  },
});

/** 归一化只准动样式的表示形式，不准动画面。这是它能被放进保存路径的前提。 */
const assertSameRender = (doc: TemplateDocument, label: string) => {
  const before = compile(doc, resume);
  const after = compile(normalizeStyles(doc).document, resume);
  assert.deepEqual(after.root, before.root, `${label}：归一化改变了渲染结果`);
};

test('重复出现的内联样式被提进字典，节点改成引用', () => {
  const { document, hoisted } = normalizeStyles(repeated());
  assert.equal(hoisted, 1, '只有 fontWeight:700 出现了 3 次，该提 1 条');

  const styles = document.styles ?? {};
  const name = Object.keys(styles).find((k) => styles[k].fontWeight === 700);
  assert.ok(name, '字典里没有提出来的那条');

  const children = (document.root as Extract<TemplateNode, { type: 'Box' }>).children ?? [];
  assert.deepEqual(children[0].style, [name]);
  assert.deepEqual(children[1].style, [name]);
  assert.deepEqual(children[2].style, [name]);
});

/** 提一条只用过一次的样式，字节数反而变多，还多一层间接。 */
test('只出现一次的样式留在原地', () => {
  const { document } = normalizeStyles(repeated());
  const children = (document.root as Extract<TemplateNode, { type: 'Box' }>).children ?? [];
  assert.deepEqual(children[3].style, [gray]);
});

test('不改变渲染结果', () => {
  assertSameRender(repeated(), '重复样式');
});

test('对真实预设也不改变渲染结果', () => {
  const doc = defaultSectionPreset({
    sectionKey: 'experience',
    title: '工作经历',
    fieldMap: { mainTitle: 'company', sideTitle: 'date', description: ['summary'] },
    tokens: {
      primary: '#1f2937',
      text: '#111827',
      bodyFontSize: 14,
      titleFontSize: 18,
      lineHeight: 1.5,
      sectionSpacing: 16,
      sectionTitleSpacing: 6,
      paragraphSpacing: 12,
      titleDividerWidth: 1,
      showTitleIcon: false,
    },
  });
  assertSameRender(doc, '预设');
});

/** 不幂等的话，每次保存都产生一个假 diff。 */
test('幂等', () => {
  const once = normalizeStyles(repeated()).document;
  const twice = normalizeStyles(once);
  assert.deepEqual(twice.document, once);
  assert.equal(twice.hoisted, 0, '第二遍不该再提取任何东西');
});

test('确定性：同样的输入永远得到同样的名字', () => {
  assert.deepEqual(normalizeStyles(repeated()).document, normalizeStyles(repeated()).document);
});

/** 键序不同但内容相同的两个对象是同一个样式，不该各占一条。 */
test('键序不影响去重', () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'w',
      type: 'Box',
      children: [
        { id: 'a', type: 'Text', value: 'x', style: [{ color: '#000', fontSize: 12 }] },
        { id: 'b', type: 'Text', value: 'y', style: [{ fontSize: 12, color: '#000' }] },
      ],
    },
  };
  assert.equal(normalizeStyles(doc).hoisted, 1);
});

test('与字典里已有的样式相同时直接复用，不新建', () => {
  const doc: TemplateDocument = {
    version: 1,
    styles: { heading: { fontWeight: 700 } },
    root: {
      id: 'w',
      type: 'Box',
      children: [
        { id: 'a', type: 'Text', value: 'x', style: [{ fontWeight: 700 }] },
        { id: 'b', type: 'Text', value: 'y', style: [{ fontWeight: 700 }] },
      ],
    },
  };
  const { document, hoisted } = normalizeStyles(doc);
  assert.equal(hoisted, 0, '字典里已经有了，不该再建一条');
  assert.deepEqual(Object.keys(document.styles ?? {}), ['heading']);
  const children = (document.root as Extract<TemplateNode, { type: 'Box' }>).children ?? [];
  assert.deepEqual(children[0].style, ['heading']);
});

/**
 * `["base", {覆盖}]` 换成 `["base", "sN"]` 之后，覆盖关系必须还在后面。
 * 顺序反了就是「明明写了覆盖却不生效」，而且只在少数节点上表现出来。
 */
test('引用与内联混排时合并顺序不变', () => {
  const doc: TemplateDocument = {
    version: 1,
    styles: { base: { color: '#000', fontSize: 10 } },
    root: {
      id: 'w',
      type: 'Box',
      children: [
        { id: 'a', type: 'Text', value: 'x', style: ['base', { color: '#f00' }] },
        { id: 'b', type: 'Text', value: 'y', style: ['base', { color: '#f00' }] },
      ],
    },
  };
  const { document } = normalizeStyles(doc);
  const children = (document.root as Extract<TemplateNode, { type: 'Box' }>).children ?? [];
  assert.equal((children[0].style ?? [])[0], 'base', '基础样式必须仍在第一位');
  assert.equal(typeof (children[0].style ?? [])[1], 'string', '覆盖样式已被提取');
  assertSameRender(doc, '混排');
});

test('名字不与字典里已有的键撞车', () => {
  const doc: TemplateDocument = {
    version: 1,
    styles: { s1: { color: '#123456' } },
    root: {
      id: 'w',
      type: 'Box',
      children: [
        { id: 'a', type: 'Text', value: 'x', style: [{ fontWeight: 700 }] },
        { id: 'b', type: 'Text', value: 'y', style: [{ fontWeight: 700 }] },
      ],
    },
  };
  const { document } = normalizeStyles(doc);
  assert.deepEqual(document.styles?.s1, { color: '#123456' }, '原有的 s1 被覆盖了');
  assert.ok(document.styles?.s2, '新名字应该跳到 s2');
});

/** `separator` 与 `fallback` 是最容易在遍历里漏掉的两个分支。 */
test('separator 与 fallback 里的样式也参与归一化', () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'w',
      type: 'Box',
      each: { path: 'sections.experience' },
      separator: { id: 'sep', type: 'Text', value: '·', style: [{ fontWeight: 700 }] },
      children: [
        {
          id: 'a',
          type: 'Sparkline',
          fallback: { id: 'fb', type: 'Text', value: { read: 'company' }, style: [{ fontWeight: 700 }] },
        } as unknown as TemplateNode,
      ],
    },
  };
  const { document, hoisted } = normalizeStyles(doc);
  assert.equal(hoisted, 1, 'separator 与 fallback 里各一次，合起来到了阈值');
  const sep = (document.root as Extract<TemplateNode, { type: 'Box' }>).separator;
  assert.equal(typeof (sep?.style ?? [])[0], 'string', 'separator 的样式没被改写');
});

test('空文档与无样式文档不炸', () => {
  const bare: TemplateDocument = { version: 1, root: { id: 'r', type: 'Text', value: 'x' } };
  const { document, hoisted } = normalizeStyles(bare);
  assert.equal(hoisted, 0);
  assert.deepEqual(document.root, bare.root);
});
