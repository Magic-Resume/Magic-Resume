import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFieldEntry, getFieldValue, safeHref } from './fieldAccess';

// ── 取值 ────────────────────────────────────────────────────────────────

/**
 * 两份旧实现在这里分歧最大：屏幕用 `if (value)` 把 `0` 一并跳过，PDF 保留它。
 * 于是用户填的 `level: 0` **在屏幕上消失、在 PDF 里出现**。
 */
test('0 是合法内容，必须保留', () => {
  assert.equal(getFieldValue({ level: 0 }, 'level'), '0');
});

/** `false` 印在简历上从来不是对的，跳过它继续找下一个候选。 */
test('false 跳过，继续找候选链的下一个', () => {
  assert.equal(getFieldValue({ a: false, b: '有值' }, ['a', 'b']), '有值');
});

test('空串与 nullish 跳过', () => {
  assert.equal(getFieldValue({ a: '', b: null, c: undefined, d: '命中' }, ['a', 'b', 'c', 'd']), '命中');
});

test('取不到回 null —— 调用方据此渲染只读兜底', () => {
  assert.equal(getFieldValue({}, ['nope']), null);
  assert.equal(getFieldValue({}, undefined), null);
});

/**
 * 候选链的**顺序是承重的**：`summary` 在前因为那是编辑器真正写入的字段，
 * `description` 垫后只为让旧导入的数据还能显示。
 */
test('候选链按顺序取第一个有值的', () => {
  assert.deepEqual(getFieldEntry({ summary: 'S', description: 'D' }, ['summary', 'description']), {
    key: 'summary',
    value: 'S',
  });
  // summary 空 → 落到 description，且 key 跟着变
  assert.deepEqual(getFieldEntry({ summary: '', description: 'D' }, ['summary', 'description']), {
    key: 'description',
    value: 'D',
  });
});

/**
 * `key` 是**哪个候选赢了**，不是 fieldMap 自己的属性名。就地编辑靠它把改动
 * 锚回正确属性——写回做的是 `item[key] = …`，写错就是「改了但页面没变」。
 */
test('getFieldEntry 回的是赢的那个键，不是别名', () => {
  const entry = getFieldEntry({ description: 'D' }, ['summary', 'description']);
  assert.equal(entry?.key, 'description');
});

// ── 链接 ────────────────────────────────────────────────────────────────

/**
 * PDF 侧旧实现是无脑加 `https://` 前缀，于是 `javascript:alert(1)` 变成
 * `https://javascript:alert(1)` 并生成一个**活的** `<Link>`。这些链接是用户填的，
 * 还会出现在公开分享页上。
 */
test('危险协议一律拒绝，不做前缀拼接', () => {
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.com',
    'JaVaScRiPt:alert(1)',
  ]) {
    assert.equal(safeHref(bad), null, `${bad} 应当被拒绝`);
  }
});

test('http(s) 原样放行', () => {
  assert.equal(safeHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeHref('  http://example.com  '), 'http://example.com');
});

test('像域名的补 https://', () => {
  assert.equal(safeHref('example.com'), 'https://example.com');
  assert.equal(safeHref('www.example.com/path'), 'https://www.example.com/path');
});

test('空值回 null', () => {
  assert.equal(safeHref(''), null);
  assert.equal(safeHref('   '), null);
  assert.equal(safeHref(undefined), null);
  assert.equal(safeHref(null), null);
});
