import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TemplateDocument, TemplateNode } from './ast';
import { UNHANDLED_SECTIONS } from './compile';
import { validateTemplate } from './validate';

const wrap = (children: TemplateNode[]): TemplateDocument => ({
  version: 1,
  root: { id: 'root', type: 'Box', children },
});

/** 一棵合格的树：有绑定、有 catch-all。 */
const good = () =>
  wrap([
    { id: 'co', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
    { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
  ]);

const messages = (doc: unknown) => validateTemplate(doc).diagnostics.map((d) => d.message);

test('合格的树通过', () => {
  const r = validateTemplate(good());
  assert.equal(r.ok, true, r.diagnostics.map((d) => d.message).join('; '));
});

test('版本不对直接拒绝', () => {
  assert.equal(validateTemplate({ version: 2, root: good().root }).ok, false);
});

test('缺 root 直接拒绝', () => {
  assert.equal(validateTemplate({ version: 1 }).ok, false);
});

/** id 重复会让设计模式定位到错的节点，也会让 instanceId 撞车。 */
test('id 重复被拒绝', () => {
  const doc = wrap([
    { id: 'dup', type: 'Text', value: { read: 'a' } },
    { id: 'dup', type: 'Text', value: { read: 'b' } },
  ]);
  const r = validateTemplate(doc);
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some((d) => d.message.includes('id 重复')));
});

/** 未知类型**带 fallback 时可降级**——没有降级故事的「先小」会逼出破坏性迁移。 */
test('未知节点类型：有 fallback 只警告，没有才报错', () => {
  const withFb = wrap([
    { id: 'x', type: 'Sparkline', fallback: { id: 'fb', type: 'Text', value: { read: 'a' } } } as unknown as TemplateNode,
    { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
  ]);
  assert.equal(validateTemplate(withFb).ok, true);

  const without = wrap([{ id: 'x', type: 'Sparkline' } as unknown as TemplateNode]);
  assert.equal(validateTemplate(without).ok, false);
});

/**
 * catch-all 缺失只是 warn，但它是最该盯住的一条：没有它，用户自建的分区
 * **静默消失**——不报错，只是内容没了，比崩了更糟。
 */
test('缺 catch-all 给出警告，且警告文字点明后果', () => {
  const doc = wrap([{ id: 'co', type: 'Text', value: { read: 'company' } }]);
  const r = validateTemplate(doc);
  assert.equal(r.ok, true, 'catch-all 缺失不阻断渲染');
  assert.ok(r.diagnostics.some((d) => d.message.includes('自建分区将不会显示')));
});

/** 一棵没有任何绑定的树渲染的是模板自己的文字，不是用户的简历。 */
test('完全没有数据绑定的树被拒绝', () => {
  const doc = wrap([
    { id: 'a', type: 'Text', value: '标题一' },
    { id: 'b', type: 'Text', value: '标题二' },
    { id: 'c', type: 'Text', value: '标题三' },
  ]);
  const r = validateTemplate(doc);
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some((d) => d.message.includes('没有任何数据绑定')));
});

/**
 * AI 复刻时最容易犯的错：把参考图上的简历正文**抄进模板**，而不是绑定。
 * 短字面量是标签（「工作经历」），长的多半是抄的。
 */
test('长字面量正文被标为疑似写死用户内容', () => {
  const doc = wrap([
    { id: 'x', type: 'Text', value: '负责搭建前端工程体系，主导构建性能优化，收益 40%' },
    { id: 'ok', type: 'Text', value: { read: 'company' } },
    { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
  ]);
  assert.ok(messages(doc).some((m) => m.includes('疑似把用户内容写死')));
});

test('短字面量是标签，不报警', () => {
  const doc = wrap([
    { id: 'label', type: 'Text', value: '工作经历' },
    { id: 'ok', type: 'Text', value: { read: 'company' } },
    { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
  ]);
  assert.equal(messages(doc).some((m) => m.includes('疑似把用户内容写死')), false);
});

test('缺必填字段被拒绝', () => {
  assert.equal(validateTemplate(wrap([{ id: 'a', type: 'Text' } as unknown as TemplateNode])).ok, false);
  assert.equal(validateTemplate(wrap([{ id: 'b', type: 'Icon' } as unknown as TemplateNode])).ok, false);
  assert.equal(validateTemplate(wrap([{ id: 'c', type: 'Image' } as unknown as TemplateNode])).ok, false);
});

test('嵌套过深被拒绝，不会栈溢出', () => {
  let node: TemplateNode = { id: 'leaf', type: 'Text', value: { read: 'a' } };
  for (let i = 0; i < 40; i++) {
    node = { id: `b${i}`, type: 'Box', children: [node] };
  }
  const r = validateTemplate({ version: 1, root: node });
  assert.equal(r.ok, false);
  assert.ok(r.diagnostics.some((d) => d.message.includes('嵌套超过')));
});

test('非对象输入不抛异常', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.doesNotThrow(() => validateTemplate(bad));
  }
});
