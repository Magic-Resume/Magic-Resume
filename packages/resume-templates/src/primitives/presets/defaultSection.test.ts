import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compile } from '../compile';
import type { ResolvedBox, ResolvedNode } from '../types';
import { validateTemplate } from '../validate';
import { defaultSectionPreset, type PresetTokens } from './defaultSection';

/**
 * 第一个预设的验收。
 *
 * 这些断言的作用不是「预设长得对」，而是**词汇表够不够用**——每一条对应
 * legacy `DefaultSection` 的一个真实能力，缺哪条就说明原语层缺东西。
 */

const tokens: PresetTokens = {
  primary: '#1f2937',
  text: '#111827',
  bodyFontSize: 14,
  titleFontSize: 18,
  lineHeight: 1.5,
  sectionSpacing: 16,
  sectionTitleSpacing: 6,
  paragraphSpacing: 12,
  titleDividerWidth: 1,
  showTitleIcon: true,
};

const fieldMap = {
  mainTitle: 'company',
  mainSubtitle: 'position',
  sideTitle: 'date',
  sideSubtitle: 'location',
  description: ['summary', 'description'],
};

const build = (resume: Record<string, unknown>, overrides: Partial<PresetTokens> = {}) => {
  const doc = defaultSectionPreset({
    sectionKey: 'experience',
    title: '工作经历',
    fieldMap,
    tokens: { ...tokens, ...overrides },
    iconName: 'briefcase',
  });
  const { root, diagnostics } = compile(doc, resume);
  return { doc, root, diagnostics };
};

const resume = {
  sections: {
    experience: [
      {
        id: 'e1',
        company: '甲公司',
        position: '前端工程师',
        date: '2023 - 至今',
        summary: '<p>做了 A</p>',
        customFields: [{ id: 'c1', name: '技术栈', value: 'React' }],
      },
      { id: 'e2', company: '乙公司', date: '2021 - 2023' },
    ],
  },
  sectionOrder: [{ key: 'experience' }],
};

/** 深度优先收集，测试里反复要用。 */
const flatten = (node: ResolvedNode | null | undefined): ResolvedNode[] =>
  !node ? [] : [node, ...(node.type === 'Box' ? node.children.flatMap(flatten) : [])];

const textsOf = (root: ResolvedNode | null | undefined) =>
  flatten(root)
    .filter((n): n is Extract<ResolvedNode, { type: 'Text' }> => n.type === 'Text')
    .map((n) => n.text);

test('预设本身通过校验器', () => {
  const doc = defaultSectionPreset({
    sectionKey: 'experience',
    title: '工作经历',
    fieldMap,
    tokens,
  });
  const r = validateTemplate(doc);
  // catch-all 的警告在这里是预期的：这是一个**分区**预设，不是整份模板。
  const blocking = r.diagnostics.filter((d) => d.level === 'error');
  assert.deepEqual(blocking, [], blocking.map((d) => d.message).join('; '));
});

test('编译无错误诊断', () => {
  const { diagnostics } = build(resume);
  const errors = diagnostics.filter((d) => d.level === 'error');
  assert.deepEqual(errors, [], errors.map((d) => d.message).join('; '));
});

test('每个条目都渲染，缺字段的那行整行消失而不是留空洞', () => {
  const texts = textsOf(build(resume).root);
  assert.ok(texts.includes('甲公司'));
  assert.ok(texts.includes('乙公司'));
  assert.ok(texts.includes('前端工程师'));
  // e2 没有 position/location，不该出现空字符串节点
  assert.equal(texts.some((t) => t.trim() === ''), false, '出现了空文本节点');
});

test('候选链生效：summary 命中时写回的是 summary 而不是别名', () => {
  const rich = flatten(build(resume).root).find((n) => n.type === 'RichText');
  assert.ok(rich && rich.type === 'RichText');
  assert.equal(rich.edit?.fieldKey, 'summary');
  assert.equal(rich.edit?.itemId, 'e1');
});

/** legacy 的评审卡标题就是这个格式，换成 `experience · summary` 是可读性退步。 */
test('编辑标签是「工作经历 · 第 N 条」', () => {
  const rich = flatten(build(resume).root).find((n) => n.type === 'RichText');
  assert.equal(rich?.type === 'RichText' ? rich.edit?.label : undefined, '工作经历 · 第 1 条');
});

test('区块手柄与插入槽都在，且挂在正确的 sectionKey 上', () => {
  const boxes = flatten(build(resume).root).filter(
    (n): n is ResolvedBox => n.type === 'Box' && Boolean(n.editor),
  );
  const handle = boxes.find((b) => b.editor?.handle);
  const slot = boxes.find((b) => b.editor?.insertSlot);
  assert.equal(handle?.editor?.sectionKey, 'experience');
  assert.equal(handle?.editor?.title, '工作经历');
  assert.equal(slot?.editor?.sectionKey, 'experience');
});

test('自定义字段：有名字才有冒号', () => {
  const texts = textsOf(build(resume).root);
  assert.ok(texts.includes('技术栈：'), '有名字的应带冒号');
  assert.ok(texts.includes('React'));

  const noName = {
    ...resume,
    sections: {
      experience: [{ id: 'e1', company: '甲', customFields: [{ id: 'c1', value: '只有值' }] }],
    },
  };
  const t2 = textsOf(build(noName).root);
  assert.ok(t2.includes('只有值'));
  assert.equal(t2.some((t) => t.includes('：')), false, '没有名字时不该出现孤零零的冒号');
});

test('隐藏条目被过滤', () => {
  const withHidden = {
    ...resume,
    sections: {
      experience: [
        { id: 'e1', company: '看得见' },
        { id: 'e2', company: '藏起来', visible: false },
      ],
    },
  };
  const texts = textsOf(build(withHidden).root);
  assert.ok(texts.includes('看得见'));
  assert.equal(texts.includes('藏起来'), false);
});

/** `showTitleDivider: false` 的模板存在，这条线必须真的能关掉。 */
test('标题下划线可关', () => {
  const off = flatten(build(resume, { titleDividerWidth: 0 }).root).find(
    (n): n is ResolvedBox => n.type === 'Box' && Boolean(n.editor?.handle),
  );
  assert.equal(off?.style.borderBottomWidth, 0);
});

test('标题图标可关', () => {
  const withIcon = flatten(build(resume).root).some((n) => n.type === 'Icon');
  assert.equal(withIcon, true);
  const withoutIcon = flatten(build(resume, { showTitleIcon: false }).root).some(
    (n) => n.type === 'Icon',
  );
  assert.equal(withoutIcon, false);
});

/**
 * 条目没有 id 时**必须留下诊断**。legacy 在这种情况下静默退化成只读，
 * 用户点了没反应也不知道为什么——原语层至少要让这件事在日志里可见。
 */
test('条目缺 id 时留下可编辑性诊断', () => {
  const noId = { ...resume, sections: { experience: [{ company: '无 id 公司' }] } };
  const { diagnostics, root } = build(noId);
  assert.ok(textsOf(root).includes('无 id 公司'), '仍然要显示出来');
  assert.ok(
    diagnostics.some((d) => d.message.includes('不可编辑')),
    '缺 id 导致不可编辑，必须留下诊断',
  );
});
