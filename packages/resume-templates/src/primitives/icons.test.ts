import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ICON_NODES, hasIcon, iconNodeByName } from './icons';
import { sectionIconByName } from '../sectionIcons';
import { UNHANDLED_SECTIONS } from './compile';
import { checkOverflow } from './overflow';
import type { TemplateDocument } from './ast';

/**
 * 图标的双端一致性。
 *
 * 这个文件是从一个**真实事故**里长出来的：原语层的 `Icon` 节点把 React
 * 组件喂给了只吃 Hugeicons 路径数据的 `PdfHugeIcon`，导出当场抛
 * `icon.map is not a function`——而屏幕上完全正常。
 *
 * 两件事让它藏了很久：一个 `as never` 把类型错误压了下去；一致性测试只遍历元素树、
 * 从不真渲染，而 `PdfHugeIcon` 是组件，遍历看不穿它。
 * **所以下面最后一条必须真的 renderToBuffer。**
 */

test('两个后端的图标名字完全一致', () => {
  for (const name of Object.keys(ICON_NODES)) {
    assert.ok(
      sectionIconByName(name),
      `「${name}」只有 PDF 侧有——屏幕上会缺一个图标，而且不报错`,
    );
  }
});

test('PDF 侧拿到的是路径数据（数组），不是 React 组件', () => {
  for (const [name, node] of Object.entries(ICON_NODES)) {
    assert.ok(Array.isArray(node), `「${name}」不是 PDF 图标节点，渲染会抛 icon.map is not a function`);
  }
});

test('查不到的名字返回 undefined 而不是抛', () => {
  assert.equal(iconNodeByName('根本没有的图标'), undefined);
  assert.equal(hasIcon('根本没有的图标'), false);
  assert.equal(hasIcon('briefcase'), true);
});

/** 联系方式行要用的三个——复刻密集型技术简历版式时缺一不可。 */
test('联系方式图标齐备', () => {
  for (const name of ['phone', 'mail', 'github', 'location']) {
    assert.ok(hasIcon(name), `缺 ${name}`);
  }
});

/**
 * **这一条是真渲染，慢，但只有它能守住那个 bug。**
 *
 * 遍历元素树的测试对这类问题是瞎的：`PdfHugeIcon` 是组件元素，遍历器看不穿它，
 * 里面抛不抛异常要等到 `renderToBuffer` 才知道。
 */
test('每一个图标都能真的渲进 PDF', async () => {
  const doc: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      style: [{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }],
      children: [
        ...Object.keys(ICON_NODES).map((name) => ({
          id: `icon-${name}`,
          type: 'Icon' as const,
          name,
          size: 12,
        })),
        { id: 'anchor', type: 'Text', value: { read: 'info.fullName' } },
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    },
  };

  const r = await checkOverflow(doc, { info: { fullName: 'X' } }, { fontFamily: 'Helvetica' });
  assert.equal(r.ok, true, `图标渲染失败：${r.error}`);
  assert.ok(r.bytes > 0);
});
