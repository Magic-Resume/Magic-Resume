import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TemplateDocument, TemplateNode } from './ast';
import { compile } from './compile';
import {
  findNode,
  isNodeHidden,
  moveNode,
  outlineOf,
  removeNode,
  setNodeHidden,
  setNodeStyle,
  setNodeText,
} from './edit';

/**
 * 设计模式的树补丁。
 *
 * 这些操作会直接落到用户存在简历上的模板树，所以**不可变**与**幂等**不是风格问题：
 * 撤销栈靠前者，反复点同一个按钮靠后者。
 */

const resume = {
  sections: { experience: [{ id: 'e1', company: '甲' }, { id: 'e2', company: '乙' }] },
  sectionOrder: [{ key: 'experience' }],
};

const doc = (): TemplateDocument => ({
  version: 1,
  styles: { base: { fontSize: 12, color: '#111' } },
  root: {
    id: 'root',
    type: 'Box',
    section: { sectionKey: 'experience', title: '工作经历', handle: true },
    children: [
      { id: 'title', type: 'Text', value: '工作经历', style: ['base'] },
      { id: 'co', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
      { id: 'ic', type: 'Icon', name: 'briefcase' },
    ],
  },
});

const childIds = (d: TemplateDocument) =>
  ((d.root as Extract<TemplateNode, { type: 'Box' }>).children ?? []).map((c) => c.id);

const styleOf = (d: TemplateDocument, id: string) => findNode(d, id)?.style;

test('findNode 找得到，找不到返回 undefined 而不是抛', () => {
  assert.equal(findNode(doc(), 'title')?.type, 'Text');
  assert.equal(findNode(doc(), '不存在'), undefined);
});

// ── 样式 ──────────────────────────────────────────────────────────────

test('改样式是合并不是替换', () => {
  const next = setNodeStyle(doc(), 'title', { fontSize: 20 });
  const next2 = setNodeStyle(next, 'title', { color: '#f00' });
  const s = styleOf(next2, 'title');
  assert.deepEqual(s?.[0], 'base', '原有的字典引用必须还在');
  assert.deepEqual(s?.[1], { fontSize: 20, color: '#f00' }, '两次调整都要保留');
});

/** 「我明明调了却不生效」几乎总是覆盖顺序错了。 */
test('覆盖永远压在最后一位', () => {
  const next = setNodeStyle(doc(), 'title', { fontSize: 20 });
  const s = styleOf(next, 'title') ?? [];
  assert.equal(s[s.length - 1] && typeof s[s.length - 1], 'object');
  assert.equal(s[0], 'base');
});

/** 调二十次字号不该堆出二十个对象。 */
test('反复调整不会堆叠出多个覆盖对象', () => {
  let d = doc();
  for (let i = 0; i < 20; i++) d = setNodeStyle(d, 'title', { fontSize: 10 + i });
  const s = styleOf(d, 'title') ?? [];
  assert.equal(s.length, 2, `期望 [引用, 覆盖]，实际 ${s.length} 项`);
  assert.deepEqual(s[1], { fontSize: 29 });
});

test('传 null 删掉属性（重置按钮）', () => {
  const withSize = setNodeStyle(doc(), 'title', { fontSize: 20, color: '#f00' });
  const reset = setNodeStyle(withSize, 'title', { fontSize: null });
  assert.deepEqual(styleOf(reset, 'title')?.[1], { color: '#f00' });
});

/** 面板是人在操作，非法值要当场丢掉，而不是等到渲染时静默消失。 */
test('非法样式在补丁阶段就被剔掉', () => {
  const next = setNodeStyle(doc(), 'title', { boxShadow: '0 0 4px', fontWeight: 500, fontSize: 16 });
  assert.deepEqual(styleOf(next, 'title')?.[1], { fontSize: 16 });
});

test('超范围的数值被钳住而不是原样存下', () => {
  const next = setNodeStyle(doc(), 'title', { fontSize: 9999 });
  const v = (styleOf(next, 'title')?.[1] as Record<string, number>).fontSize;
  assert.ok(v < 9999 && v > 0, `期望被钳住，实际 ${v}`);
});

// ── 文案 ──────────────────────────────────────────────────────────────

/** 取一个节点的 `value`。写成 helper 是因为 `TemplateNode` 是联合类型，
 *  只有收窄到 Text/RichText 之后才有这个字段。 */
const valueOf = (d: TemplateDocument, id: string): unknown => {
  const n = findNode(d, id);
  return n && (n.type === 'Text' || n.type === 'RichText') ? n.value : undefined;
};

test('改字面量文案', () => {
  assert.equal(valueOf(setNodeText(doc(), 'title', '职业经历'), 'title'), '职业经历');
});

/**
 * 绑定节点上的「文案」是**用户的简历内容**，不是模板。改它要走就地编辑，
 * 从设计面板改会把某个人的公司名写死进模板，别人用这个模板就看到他的公司。
 */
test('绑定节点的文案改不动', () => {
  assert.deepEqual(valueOf(setNodeText(doc(), 'co', '写死的公司名'), 'co'), { read: 'company' });
});

// ── 显隐 ──────────────────────────────────────────────────────────────

test('隐藏后编译不出这个节点，取消隐藏后又回来', () => {
  const hidden = setNodeHidden(doc(), 'ic', true);
  assert.equal(isNodeHidden(findNode(hidden, 'ic')), true);

  const texts = (d: TemplateDocument) => {
    const { root } = compile(d, resume);
    const out: string[] = [];
    const walk = (n: NonNullable<typeof root>): void => {
      if (n.type === 'Icon') out.push('icon');
      if (n.type === 'Box') n.children.forEach(walk);
    };
    if (root) walk(root);
    return out;
  };
  assert.deepEqual(texts(hidden), [], '隐藏了就不该渲染出来');
  assert.deepEqual(texts(setNodeHidden(hidden, 'ic', false)), ['icon']);
});

/** 取消隐藏不能顺手把模板作者写的条件也清掉。 */
test('取消隐藏不动用户自己写的 when', () => {
  const withWhen: TemplateDocument = {
    version: 1,
    root: { id: 'r', type: 'Text', value: 'x', when: { exists: 'info.website' } },
  };
  const next = setNodeHidden(withWhen, 'r', false);
  assert.deepEqual(next.root.when, { exists: 'info.website' });
});

// ── 重排与删除 ────────────────────────────────────────────────────────

test('同级挪动', () => {
  assert.deepEqual(childIds(moveNode(doc(), 'ic', -1)), ['title', 'ic', 'co']);
  assert.deepEqual(childIds(moveNode(doc(), 'title', 1)), ['co', 'title', 'ic']);
});

test('挪到边界外不越界也不报错', () => {
  assert.deepEqual(childIds(moveNode(doc(), 'title', -5)), ['title', 'co', 'ic']);
  assert.deepEqual(childIds(moveNode(doc(), 'ic', 9)), ['title', 'co', 'ic']);
});

test('删除节点', () => {
  assert.deepEqual(childIds(removeNode(doc(), 'ic')), ['title', 'co']);
});

/** 删了根就没有树了，整份简历空白。 */
test('根节点删不掉', () => {
  const next = removeNode(doc(), 'root');
  assert.equal(next.root.id, 'root');
});

// ── 不可变 ────────────────────────────────────────────────────────────

/**
 * **撤销栈靠这一条。** 原地改的话撤销栈里全是同一个对象的引用，
 * 用户点撤销会发现什么都没变——而这个 bug 只在他点撤销时才暴露。
 */
test('所有操作都不改动原树', () => {
  const original = doc();
  const snapshot = JSON.stringify(original);
  setNodeStyle(original, 'title', { fontSize: 20 });
  setNodeText(original, 'title', '改了');
  setNodeHidden(original, 'ic', true);
  moveNode(original, 'ic', -1);
  removeNode(original, 'ic');
  assert.equal(JSON.stringify(original), snapshot, '原树被改动了');
});

// ── 大纲 ──────────────────────────────────────────────────────────────

/** 一列 `Text` `Text` `Text` 的大纲等于没有大纲。 */
test('大纲的标签是人能读的', () => {
  const entries = outlineOf(doc());
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(byId.title.label, '工作经历', '字面量优先');
  assert.equal(byId.co.label, 'company', '绑定节点显示读取路径');
  assert.equal(byId.ic.label, 'briefcase');
});

test('大纲带层级、显隐与分区标记', () => {
  const entries = outlineOf(setNodeHidden(doc(), 'ic', true));
  assert.equal(entries[0].depth, 0);
  assert.equal(entries[0].sectionKey, 'experience');
  assert.equal(entries[1].depth, 1);
  assert.equal(entries.find((e) => e.id === 'ic')?.hidden, true);
});

test('大纲覆盖 separator 这类容易漏掉的分支', () => {
  const withSep: TemplateDocument = {
    version: 1,
    root: {
      id: 'r',
      type: 'Box',
      each: { path: 'sections.experience' },
      separator: { id: 'sep', type: 'Text', value: '·' },
      children: [{ id: 'c', type: 'Text', value: { read: 'company' } }],
    },
  };
  assert.ok(outlineOf(withSep).some((e) => e.id === 'sep'), 'separator 没进大纲，面板上就选不中它');
});
