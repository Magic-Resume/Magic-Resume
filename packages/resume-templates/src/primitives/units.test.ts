import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LENGTH_KEYS, PX_TO_PT, SPACING_SCALE } from './style';

/**
 * 单位。**IR 的长度一律是 CSS px**，换算只发生在 PDF 后端边界。
 *
 * 单独立一个文件，是因为这类 bug 有个讨厌的性质：**它不会让任何东西报错**。
 * 同一个 `fontSize: 10`，DOM 渲成 10px、react-pdf 渲成 10pt——数值相等，
 * 类型相同，一致性测试比 `10 === 10` 也是绿的，只有把导出的 PDF 拿在手上
 * 才看得出整体大了 33%。所以这里直接钉住换算本身。
 */

test('长度键清单不含无单位属性', () => {
  // 给这些乘 0.75 是直接改坏语义，不是缩放：
  // lineHeight 是倍数、opacity 是比例、flexGrow 是权重。
  for (const key of ['lineHeight', 'opacity', 'flexGrow', 'flexShrink', 'color', 'fontWeight']) {
    assert.equal(LENGTH_KEYS.has(key), false, `${key} 不该被当成长度换算`);
  }
});

test('长度键清单覆盖所有会影响版面尺寸的属性', () => {
  for (const key of [
    'fontSize',
    'gap',
    'padding',
    'marginTop',
    'width',
    'borderRadius',
    'borderBottomWidth',
    'letterSpacing',
  ]) {
    assert.equal(LENGTH_KEYS.has(key), true, `${key} 漏了换算，PDF 里会偏大 33%`);
  }
});

test('px → pt 是 72/96', () => {
  assert.equal(PX_TO_PT, 0.75);
  assert.equal(16 * PX_TO_PT, 12);
});

/** 间距档位也是 px——它和其它长度走同一条换算路径，不能自成一套。 */
test('间距档位单调递增且从 0 起步', () => {
  const values = ['none', 'xs', 'sm', 'md', 'lg', 'xl'].map((k) => SPACING_SCALE[k]);
  assert.equal(values[0], 0);
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] > values[i - 1], `${values[i]} 没有比前一档大`);
  }
});
