import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TemplateDocument } from './ast';
import { compile } from './compile';
import { renderNode } from './dom/renderNode';
import { setNodeStyle } from './edit';

/**
 * 设计模式在渲染器这一侧的行为。
 *
 * 只验两件事，但都是会咬人的：**选中态标到了正确的节点**，
 * 以及**设计模式下不进就地编辑**。
 */

const resume = {
  info: { fullName: '张三' },
  sections: {
    experience: [
      { id: 'e1', company: '甲公司', summary: '<p>做了 A</p>' },
      { id: 'e2', company: '乙公司', summary: '<p>做了 B</p>' },
    ],
  },
  sectionOrder: [{ key: 'experience' }],
};

const doc: TemplateDocument = {
  version: 1,
  root: {
    id: 'root',
    type: 'Box',
    section: { sectionKey: 'experience', title: '工作经历', handle: true, insertSlot: true },
    children: [
      { id: 'title', type: 'Text', value: '工作经历' },
      {
        id: 'item',
        type: 'Box',
        each: { path: 'sections.experience' },
        children: [
          { id: 'co', type: 'Text', value: { read: 'company' } },
          { id: 'sum', type: 'RichText', value: { read: 'summary' } },
        ],
      },
    ],
  },
};

const html = (design?: { selectedId?: string }): string => {
  const { root } = compile(doc, resume);
  assert.ok(root);
  return renderToStaticMarkup(<>{renderNode(root, design ? { design } : undefined)}</>);
};

const countOf = (s: string, needle: string) => s.split(needle).length - 1;

test('每个节点都带 data-template-node，设计模式靠它定位', () => {
  const out = html();
  for (const id of ['root', 'title', 'item', 'co']) {
    assert.ok(out.includes(`data-template-node="${id}"`), `缺 ${id}`);
  }
});

/**
 * **`each` 展开出的多个实例共用一个 `templateNodeId`，所以会一起被选中。**
 *
 * 这正是设计模式该有的语义：改的是模板节点，不是某一条经历。若按实例选中，
 * 用户调了第 2 条的字号，第 1、3 条纹丝不动——那不是模板编辑器，那是文本编辑器。
 */
test('选中一个模板节点，它展开出的所有实例一起标记', () => {
  const out = html({ selectedId: 'co' });
  assert.equal(countOf(out, 'data-template-selected="true"'), 2, '两条经历都该被标记');
  assert.ok(out.includes('甲公司') && out.includes('乙公司'));
});

test('没选中任何东西时不留下选中标记', () => {
  assert.equal(countOf(html({}), 'data-template-selected'), 0);
});

test('非设计模式下完全不出选中属性', () => {
  assert.equal(countOf(html(), 'data-template-selected'), 0);
});

/**
 * **设计模式与就地编辑在「点击」上冲突。**
 *
 * 就地编辑要「点文字 → 插入光标」，设计模式要「点文字 → 选中模板节点」，
 * 同一次点击做不了两件事。所以设计模式下不套 `Editable`——套了会出现
 * 「想调字号，结果进了编辑态」这种两边都不对的状态。
 */
test('设计模式下不套 Editable，也不出区块手柄与插入槽', () => {
  // 直接在元素树上数组件。
  // **不能用 renderToStaticMarkup 的 HTML 来判**：没有 Provider 时 `Editable`
  // 处于禁用态、渲染的是裸文本，两种模式的 HTML 长得一样——那样的断言会假绿。
  const names = (design?: { selectedId?: string }): string[] => {
    const { root } = compile(doc, resume);
    assert.ok(root);
    const out: string[] = [];
    const walk = (n: React.ReactNode): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!React.isValidElement(n)) return;
      const t = n.type as { name?: string; displayName?: string } | string;
      if (typeof t !== 'string') out.push(t.displayName ?? t.name ?? '匿名');
      walk((n.props as { children?: React.ReactNode }).children);
    };
    walk(renderNode(root, design ? { design } : undefined));
    return out;
  };

  const editing = names();
  assert.ok(editing.includes('Editable'), '普通模式下就地编辑要在');
  assert.ok(editing.includes('SectionHandle'), '普通模式下区块手柄要在');
  assert.ok(editing.includes('SectionInsertSlot'), '普通模式下插入槽要在');

  const designing = names({ selectedId: 'co' });
  assert.equal(designing.includes('Editable'), false, '设计模式下不该有就地编辑');
  assert.equal(designing.includes('SectionHandle'), false, '设计模式下不该有区块手柄');
  assert.equal(designing.includes('SectionInsertSlot'), false, '设计模式下不该有插入槽');

  // 内容还是要照常显示——只是点击语义变了
  assert.ok(html({ selectedId: 'co' }).includes('甲公司'), '设计模式下内容仍要看得见');
});

/** 补丁改完样式，重新编译渲染要真的反映出来——这是设计面板的闭环。 */
test('改样式 → 重新编译 → 画面上真的变了', () => {
  const before = html();
  assert.equal(before.includes('font-size:28px'), false);

  const patched = setNodeStyle(doc, 'title', { fontSize: 28 });
  const { root } = compile(patched, resume);
  assert.ok(root);
  const after = renderToStaticMarkup(<>{renderNode(root)}</>);
  assert.ok(after.includes('font-size:28px'), '调过的字号没落到画面上');
});
