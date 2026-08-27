import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Font } from '@react-pdf/renderer';
import type { TemplateDocument } from './ast';
import { UNHANDLED_SECTIONS } from './compile';
import { checkOverflow, pageCountOf } from './overflow';

/**
 * 溢出自检的验收。**这些用例真的渲染 PDF**，所以比其它单测慢一个量级——
 * 但也只有它们能回答「导出会不会炸」。
 */

// react-pdf 默认字体只有 Helvetica，画不了中文；这里注册一个内置族即可，
// 本文件验的是页数与失败路径，不是字形。
Font.register({ family: 'Test', src: 'Helvetica' } as never);

const FONT = 'Helvetica';

const resume = (count: number) => ({
  sections: {
    experience: Array.from({ length: count }, (_, i) => ({
      id: `e${i}`,
      company: `Company ${i}`,
      summary: `Did a lot of things at company number ${i}. `.repeat(8),
    })),
  },
  sectionOrder: [{ key: 'experience' }],
});

const doc = (page?: TemplateDocument['page']): TemplateDocument => ({
  version: 1,
  ...(page ? { page } : {}),
  root: {
    id: 'root',
    type: 'Box',
    style: [{ fontSize: 12, gap: 8 }],
    children: [
      {
        id: 'item',
        type: 'Box',
        each: { path: 'sections.experience' },
        keepTogether: true,
        children: [
          { id: 'co', type: 'Text', value: { read: 'company' }, style: [{ fontWeight: 700 }] },
          { id: 'sum', type: 'Text', value: { read: 'summary' } },
        ],
      },
      { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
    ],
  },
});

test('页数解析：能从真实 PDF 字节里读出页数', async () => {
  const r = await checkOverflow(doc(), resume(2), { fontFamily: FONT });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.pages, 1);
  assert.ok(r.bytes > 0);
});

/** 默认单页：内容再多也只有一页（页面随内容长高），这是既定的产品行为。 */
test('single 模式：内容很多也仍是一页，且不报溢出', async () => {
  const r = await checkOverflow(doc(), resume(40), { fontFamily: FONT });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.pages, 1);
  assert.equal(r.overflow, false, 'single 模式没有页边界，"超页"不成立');
});

test('paged 模式：内容多了真的会分页', async () => {
  const r = await checkOverflow(doc({ mode: 'paged', margin: 40 }), resume(40), {
    fontFamily: FONT,
  });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.pages > 1, `期望分页，实际 ${r.pages} 页`);
  assert.equal(r.overflow, true, '超过 maxPages=1 应报溢出');
});

test('paged 模式：内容少时不分页，也不报溢出', async () => {
  const r = await checkOverflow(doc({ mode: 'paged', margin: 40 }), resume(1), {
    fontFamily: FONT,
  });
  assert.equal(r.pages, 1);
  assert.equal(r.overflow, false);
});

test('maxPages 可放宽', async () => {
  const r = await checkOverflow(doc({ mode: 'paged' }), resume(40), {
    fontFamily: FONT,
    maxPages: 10,
  });
  assert.equal(r.overflow, false, '放宽到 10 页后不该再报溢出');
});

// ── 失败路径 ──────────────────────────────────────────────────────────

test('结构不合法时不渲染，直接报校验失败', async () => {
  const bad = { version: 1, root: { id: 'r', type: 'Nope' } } as unknown as TemplateDocument;
  const r = await checkOverflow(bad, resume(1), { fontFamily: FONT });
  assert.equal(r.ok, false);
  assert.equal(r.error, '模板未通过校验');
  assert.equal(r.bytes, 0, '不该白渲染一次');
});

/**
 * 最值钱的一条：**没注册的字体族会让 react-pdf 直接抛**（实测：
 * `Font family not registered`），而这里能在用户点导出之前抓到。
 * 自检必须把它报成 `ok:false` 而不是自己崩掉。
 *
 * 注意用的是纯 `Text` 的树——这是模板复刻最常见的标题/公司名路径。字体由
 * 文档根 Page 统一继承；若这条回落到默认 Helvetica，中文会乱码而此测试会假绿。
 */
test('字体族没注册时报成失败而不是抛异常', async () => {
  const withPlainText: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Text',
      value: { read: 'sections.experience.0.company' },
    },
  };
  const r = await checkOverflow(withPlainText, resume(1), { fontFamily: '根本没注册的字体' });
  assert.equal(r.ok, false);
  assert.ok(r.error?.includes('not registered'), `应带上原始错误：${r.error}`);
});

/**
 * 与上面相对的一条，钉住一个**与直觉相反**的实测事实：
 * **未注册的字重不会抛，它静默回落到最近的已注册字重。**
 *
 * 这条很重要，因为它决定了字重白名单的理由是什么。不是「否则导出会炸」——
 * 那是字体族和 `fontStyle: italic` 的行为——而是「浏览器按 500 渲染成 medium、
 * PDF 回落到 400，两边**看起来不一样却都不报错**」。
 * 语义一致性测试也抓不到：两边 IR 里携带的都是 500，比对是相等的。
 * 白名单是这类漂移唯一的防线。
 */
test('未注册的字重静默回落，不抛', async () => {
  const heavy: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'Text',
      // 500 会被编译期的白名单剔掉；这里直接验渲染层不会因此崩溃。
      style: [{ fontSize: 12 }],
      value: { read: 'sections.experience.0.company' },
    },
  };
  const r = await checkOverflow(heavy, resume(1), { fontFamily: FONT });
  assert.equal(r.ok, true, r.error);
});

/**
 * **这是整层里最贵的一个失败**：用户正文里打了个斜体（编辑器的 `<em>`），
 * 而当前字体族没有注册 italic 面 → react-pdf 抛 `Could not resolve font for …`
 * → **整份 PDF 导不出来**。不是某一段变形，是全崩。
 *
 * 编译期挡不住：那时不知道运行时会注册哪些面。白名单也挡不住：斜体是真实需求，
 * 删掉它是过度反应。所以防线有两道——注册端每个族都补 italic 变体
 * （没有真斜体的就指向正体文件，`pdf/browser.tsx` 已经这么做了），
 * 自检端真渲染一遍在用户点导出**之前**发现。这条测试钉的是第二道。
 */
test('正文里的斜体遇上缺 italic 面的字体族，自检必须报失败', async () => {
  Font.register({ family: 'NoItalic', fonts: [{ src: 'Helvetica', fontWeight: 400 }] } as never);

  const withEm: TemplateDocument = {
    version: 1,
    root: {
      id: 'root',
      type: 'RichText',
      each: { path: 'sections.experience' },
      value: { read: 'summary' },
    },
  };
  const data = {
    sections: { experience: [{ id: 'e1', summary: '<p>普通 <em>斜体的一段</em></p>' }] },
    sectionOrder: [{ key: 'experience' }],
  };

  const r = await checkOverflow(withEm, data, { fontFamily: 'NoItalic' });
  assert.equal(r.ok, false, '缺 italic 面时必须报失败，而不是让它留到导出时爆');
  assert.ok(
    r.error?.includes('fontStyle italic'),
    `错误信息要指向真正的原因：${r.error}`,
  );
});

test('诊断原样带出', async () => {
  // 条目没有 id → 编译期会记「不可编辑」，自检要把它转达出去。
  const noId = {
    sections: { experience: [{ company: 'X', summary: 'y' }] },
    sectionOrder: [{ key: 'experience' }],
  };
  const r = await checkOverflow(doc(), noId, { fontFamily: FONT });
  assert.ok(
    r.diagnostics.some((d) => d.includes('不可编辑')),
    `诊断没带出来：${JSON.stringify(r.diagnostics)}`,
  );
});

test('pageCountOf 对垃圾输入返回 0 而不是抛', () => {
  assert.equal(pageCountOf(new Uint8Array([1, 2, 3])), 0);
  assert.equal(pageCountOf(new Uint8Array(0)), 0);
});
