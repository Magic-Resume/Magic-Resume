import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import type { TemplateDocument } from './ast';
import { UNHANDLED_SECTIONS, compile } from './compile';
import type { ResolvedNode } from './types';
import { renderNode as renderDom } from './dom/renderNode';
import { renderNode as renderPdf } from './pdf/renderNode';
import { LENGTH_KEYS, PX_TO_PT } from './style';

/**
 * 双后端一致性。**这是本层架构唯一的系统性风险。**
 *
 * ## 为什么是语义比对而不是像素比对
 *
 * 像素比对会被字体渲染差异淹没——两个引擎的字距、行盒、抗锯齿本来就不同，
 * 阈值调松了抓不到问题，调紧了天天误报。语义比对能**精确指出**「第 3 段在 PDF 里
 * 丢了加粗」，而且不需要浏览器、不需要光栅化，跑得起在每次提交上。
 *
 * ## 比的是什么
 *
 * 从两棵 React 元素树里各抽一份归一化摘要：按顺序的文本流 + 每段的关键样式。
 * 只要一边少了一段文字、或者某段的字号/字重/颜色不同，断言就红。
 */

/**
 * 两边各抽一份「按顺序的文本 + 关键样式」。
 *
 * ⚠️ **DOM 侧必须真的渲染**（`renderToStaticMarkup`），不能只遍历元素树：
 * 可编辑的节点内容被包在 `Editable` 组件里，文本在它的 props 上而不是 children 上，
 * 光遍历元素树会把这些文字全部漏掉——而那正好是简历里最重要的那部分。
 *
 * PDF 侧没有 DOM，只能遍历元素树。两个抽取器形态不同，但产出同一种归一化摘要。
 */
interface Run {
  text: string;
  fontSize?: unknown;
  fontWeight?: unknown;
  color?: unknown;
}

const KEY_STYLE = ['fontSize', 'fontWeight', 'color'] as const;

function collect(node: React.ReactNode, inherited: Record<string, unknown>, out: Run[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return;

  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node).trim();
    if (text) {
      out.push({
        text,
        ...Object.fromEntries(
          KEY_STYLE.filter((k) => inherited[k] !== undefined).map((k) => [k, inherited[k]]),
        ),
      });
    }
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) collect(child, inherited, out);
    return;
  }

  if (React.isValidElement(node)) {
    const props = node.props as { style?: Record<string, unknown>; children?: React.ReactNode };
    // 样式向下继承，与两个渲染引擎的实际行为一致。
    const next = props.style ? { ...inherited, ...props.style } : inherited;
    collect(props.children, next, out);
  }
}

/**
 * PDF 侧：遍历 react-pdf 的元素树，并把长度**从点换回 px** 再比。
 *
 * 不换回来的话这个测试有个致命盲区：DOM 出 `font-size:10px`、PDF 出 `fontSize: 10`
 * （点），两边都是 `10`，断言绿——但 PDF 实际大 33%。归一化到同一单位，
 * PDF 后端哪天漏了换算就会显示成 10 vs 13.33。
 */
const pdfRuns = (tree: React.ReactNode): Run[] => {
  const out: Run[] = [];
  collect(tree, {}, out);
  return out.map((run) => {
    const normalized: Run = { text: run.text };
    for (const k of KEY_STYLE) {
      const v = run[k];
      normalized[k] = typeof v === 'number' && LENGTH_KEYS.has(k) ? v / PX_TO_PT : v;
    }
    return normalized;
  });
};

const parseInlineStyle = (raw: string | undefined): Record<string, unknown> => {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const decl of raw.split(';')) {
    const [k, v] = decl.split(':');
    if (!k || !v) continue;
    // style="font-size:10px" → { fontSize: 10 }
    const key = k.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const value = v.trim();
    const num = Number(value.replace(/px$/, ''));
    out[key] = Number.isFinite(num) && value !== '' ? num : value;
  }
  return out;
};

/** DOM 侧：真的渲染成 HTML，再解析回来走同一套归一化。 */
const domRuns = (tree: React.ReactNode): Run[] => {
  const root = parse(renderToStaticMarkup(<>{tree}</>));
  const out: Run[] = [];
  const walk = (node: ReturnType<typeof parse>, inherited: Record<string, unknown>) => {
    for (const child of node.childNodes) {
      const asElement = child as unknown as {
        rawTagName?: string;
        getAttribute?: (k: string) => string | undefined;
        childNodes?: unknown[];
        text?: string;
      };
      if (asElement.rawTagName) {
        const style = parseInlineStyle(asElement.getAttribute?.('style'));
        walk(child as never, { ...inherited, ...style });
      } else {
        const text = (asElement.text ?? '').trim();
        if (text) {
          out.push({
            text,
            ...Object.fromEntries(
              KEY_STYLE.filter((k) => inherited[k] !== undefined).map((k) => [k, inherited[k]]),
            ),
          });
        }
      }
    }
  };
  walk(root, {});
  return out;
};

/** 测试内部大多只关心文本流，用这个。 */
const runsOf = domRuns;

/** 同一棵 IR 各过一个后端，抽出的摘要必须一致。 */
const assertConsistent = (ir: ResolvedNode, label: string) => {
  const dom = domRuns(renderDom(ir));
  const pdf = pdfRuns(renderPdf(ir, { fontFamily: 'Test' }));
  assert.deepEqual(
    pdf.map((r) => r.text),
    dom.map((r) => r.text),
    `${label}：两个后端的文本流不一致`,
  );
  // 样式逐段比对：能精确指出「第 N 段在 PDF 里丢了加粗」。
  pdf.forEach((run, i) => {
    for (const k of KEY_STYLE) {
      assert.equal(run[k], dom[i]?.[k], `${label}：第 ${i + 1} 段「${run.text}」的 ${k} 不一致`);
    }
  });
};

const resume = {
  info: { fullName: '张三', website: 'example.com' },
  sections: {
    experience: [
      { id: 'e1', company: '甲公司', date: '2023 - 至今', summary: '<p>做了 A</p>' },
      { id: 'e2', company: '乙公司', date: '2021 - 2023' },
    ],
    awards: [{ id: 'a1', name: '优秀员工' }],
  },
  sectionOrder: [{ key: 'experience' }, { key: 'awards' }],
};

const build = (doc: TemplateDocument): ResolvedNode => {
  const { root, diagnostics } = compile(doc, resume);
  assert.ok(root, `编译失败：${diagnostics.map((d) => d.message).join('; ')}`);
  return root;
};

// ── 代表性形态 ──────────────────────────────────────────────────────────

test('一致性：公司条（图标 + 灰底 + 一行多字段）', () => {
  const ir = build({
    version: 1,
    styles: { bar: { flexDirection: 'row', gap: 6, backgroundColor: '#f4f4f5', borderRadius: 6, padding: 6 } },
    root: {
      id: 'wrap', type: 'Box',
      children: [{
        id: 'bar', type: 'Box', each: { path: 'sections.experience' }, style: ['bar'],
        children: [
          { id: 'co', type: 'Text', value: { read: 'company' }, style: [{ fontWeight: 700 }] },
          { id: 'dt', type: 'Text', value: { read: 'date' }, style: [{ color: '#71717a' }] },
        ],
      }],
    },
  });
  assertConsistent(ir, '公司条');
});

test('一致性：四级嵌套列表', () => {
  const ir = build({
    version: 1,
    root: {
      id: 'l', type: 'List', style: [{ fontSize: 10 }],
      items: [
        { value: '一级', level: 0 },
        { value: '二级', level: 1 },
        { value: '三级', level: 2 },
        { value: '四级', level: 3 },
      ],
    },
  });
  const runs = runsOf(renderDom(ir));
  // 符号必须逐级不同——三级都是同一个圆点等于把层级信息抹平。
  assert.deepEqual(runs.map((r) => r.text), ['•', '一级', '◦', '二级', '▪', '三级', '·', '四级']);
  assertConsistent(ir, '嵌套列表');
});

test('一致性：项间分隔符', () => {
  const ir = build({
    version: 1,
    root: {
      id: 'wrap', type: 'Box',
      children: [{
        id: 'row', type: 'Box', each: { path: 'sections.experience' },
        separator: { id: 'sep', type: 'Text', value: '·' },
        children: [{ id: 'co', type: 'Text', value: { read: 'company' } }],
      }],
    },
  });
  assert.deepEqual(runsOf(renderDom(ir)).map((r) => r.text), ['甲公司', '·', '乙公司']);
  assertConsistent(ir, '分隔符');
});

test('一致性：带 role 的标题（两边都要加粗）', () => {
  const ir = build({
    version: 1,
    root: {
      id: 'wrap', type: 'Box',
      children: [
        { id: 'h', type: 'Text', role: 'sectionHeading', value: '工作经历' },
        { id: 'n', type: 'Text', value: { read: 'info.fullName' } },
      ],
    },
  });
  const dom = runsOf(renderDom(ir));
  // DOM 侧靠 <h2> 的默认字重，PDF 侧靠显式 fontWeight——**语义摘要必须一致**，
  // 所以 DOM 侧也要把它写进 style，否则这条会红。
  assert.equal(dom[0].text, '工作经历');
  assertConsistent(ir, 'role 标题');
});

test('一致性：catch-all 接住用户自建分区', () => {
  const ir = build({
    version: 1,
    root: {
      id: 'wrap', type: 'Box',
      children: [
        { id: 'exp', type: 'Text', each: { path: 'sections.experience' }, value: { read: 'company' } },
        { id: 'rest', type: 'Text', each: { path: UNHANDLED_SECTIONS }, value: '{{item.key}}' },
      ],
    },
  });
  assert.ok(runsOf(renderDom(ir)).some((r) => r.text === 'awards'));
  assertConsistent(ir, 'catch-all');
});

test('一致性：不可信 href 两边都降级成纯文本', () => {
  const ir = build({
    version: 1,
    root: { id: 'a', type: 'Text', value: '点我', href: 'javascript:alert(1)' },
  });
  assertConsistent(ir, '不安全链接');
});

/** 空树、缺字段这些也必须两边一致——不一致往往就出现在边界上。 */
test('一致性：条件为假时两边都不渲染', () => {
  const ir = build({
    version: 1,
    root: {
      id: 'wrap', type: 'Box',
      children: [
        { id: 'a', type: 'Text', when: { exists: 'info.nope' }, value: '不该出现' },
        { id: 'b', type: 'Text', value: { read: 'info.fullName' } },
      ],
    },
  });
  assert.deepEqual(runsOf(renderDom(ir)).map((r) => r.text), ['张三']);
  assertConsistent(ir, '条件渲染');
});
