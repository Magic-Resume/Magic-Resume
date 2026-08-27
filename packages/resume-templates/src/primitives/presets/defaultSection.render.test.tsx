import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderNode as renderDom } from '../dom/renderNode';
import { renderNode as renderPdf } from '../pdf/renderNode';
import { compileTreeComponent } from '../treeComponent';
import { defaultSectionPreset, type PresetTokens } from './defaultSection';

/**
 * 双分支的端到端验收：同一棵预设树，**两个后端都要能画出来，且内容一致**。
 *
 * 前面的 `defaultSection.test.ts` 只验编译出的 IR 对不对；这里验的是「IR 真的
 * 能落到两个渲染器上」。分开是因为它们的失败原因完全不同——一个是模板写错，
 * 一个是后端漏实现某个原语，混在一起排查会指错方向。
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

const doc = defaultSectionPreset({
  sectionKey: 'experience',
  title: '工作经历',
  fieldMap: {
    mainTitle: 'company',
    mainSubtitle: 'position',
    sideTitle: 'date',
    description: ['summary', 'description'],
  },
  tokens,
  iconName: 'briefcase',
});

const resume = {
  sections: {
    experience: [
      { id: 'e1', company: '甲公司', position: '前端工程师', date: '2023 - 至今', summary: '<p>做了 A</p>' },
      { id: 'e2', company: '乙公司', date: '2021 - 2023' },
    ],
  },
  sectionOrder: [{ key: 'experience' }],
};

const compiled = () => {
  const root = compileTreeComponent(doc, resume, 'test-component');
  assert.ok(root, '预设树没能编译出结果');
  return root;
};

/** 从渲染出的 HTML 里按顺序抽文本，与一致性测试同一套办法。 */
const domText = (): string => {
  const html = renderToStaticMarkup(<>{renderDom(compiled())}</>);
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const pdfText = (): string => {
  const out: string[] = [];
  const walk = (node: React.ReactNode): void => {
    if (typeof node === 'string' || typeof node === 'number') {
      const t = String(node).trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (React.isValidElement(node)) {
      walk((node.props as { children?: React.ReactNode }).children);
    }
  };
  walk(renderPdf(compiled(), { fontFamily: 'Test' }));
  return out.join(' ');
};

test('DOM 后端画得出预设，且内容都在', () => {
  const text = domText();
  for (const expected of ['工作经历', '甲公司', '前端工程师', '2023 - 至今', '乙公司']) {
    assert.ok(text.includes(expected), `DOM 输出里缺「${expected}」：${text}`);
  }
});

test('PDF 后端画得出预设，且内容都在', () => {
  const text = pdfText();
  for (const expected of ['工作经历', '甲公司', '前端工程师', '2023 - 至今', '乙公司']) {
    assert.ok(text.includes(expected), `PDF 输出里缺「${expected}」：${text}`);
  }
});

/**
 * 富文本：**在 Node 里两边都展不开，所以只能验「载体在不在」，不能验文字。**
 *
 * - DOM 侧：`WysiwygContent` 在没有 `window` 时有意返回空 div——DOMPurify 跑不了，
 *   SSR 直出未净化的 HTML 就是个 XSS 洞。这是正确行为，不是丢内容。
 * - PDF 侧：`PdfRichText` 是个组件元素，遍历元素树看不穿它（`props.children` 是空的），
 *   真正的解析发生在 `renderToBuffer` 里。
 *
 * 如果这里图省事写成「两边都不含『做了 A』所以一致」，那就是一条**空对空的假绿**：
 * 把 RichText 节点整个删掉它照样过。所以改成验载体。真正的正文比对由
 * `scripts/render-pdf-smoke.mjs`（真的 renderToBuffer）和用户的视觉走查负责。
 */
test('DOM 侧留下了富文本的挂载点', () => {
  const html = renderToStaticMarkup(<>{renderDom(compiled())}</>);
  assert.ok(
    html.includes('data-template-node="experience-desc"'),
    '富文本节点在屏幕侧整个消失了（不是没展开，是没渲染）',
  );
});

test('PDF 侧把原始 HTML 交给了富文本组件', () => {
  const carried: string[] = [];
  const walk = (node: React.ReactNode): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!React.isValidElement(node)) return;
    const props = node.props as { html?: unknown; children?: React.ReactNode };
    if (typeof props.html === 'string') carried.push(props.html);
    walk(props.children);
  };
  walk(renderPdf(compiled(), { fontFamily: 'Test' }));
  assert.ok(carried.includes('<p>做了 A</p>'), `PDF 侧没拿到正文 HTML：${JSON.stringify(carried)}`);
});

/** 纯文本部分两边必须逐字一致——这部分两个抽取器都看得见，比得实。 */
test('两个后端的纯文本流一致', () => {
  const dom = domText().split(/\s+/).filter(Boolean);
  const pdf = pdfText().split(/\s+/).filter(Boolean);
  assert.deepEqual(pdf, dom);
});

// ── 故障注入：坏树不该炸，只该什么都不画 ────────────────────────────────

test('坏掉的树降级成不渲染，不抛异常', () => {
  for (const bad of [null, undefined, 'x', 42, [], { version: 2 }, { version: 1 }]) {
    assert.doesNotThrow(() => {
      const root = compileTreeComponent(bad, resume, 'bad');
      assert.equal(root, undefined, `${JSON.stringify(bad)} 不该编译出结果`);
    });
  }
});

test('数据是空的时候不炸，也不画出空壳', () => {
  const root = compileTreeComponent(doc, { sections: {}, sectionOrder: [] }, 'empty');
  assert.ok(root, '空数据仍应产出根节点（标题在）');
  const html = renderToStaticMarkup(<>{renderDom(root)}</>);
  assert.ok(html.includes('工作经历'));
  assert.equal(html.includes('甲公司'), false);
});
