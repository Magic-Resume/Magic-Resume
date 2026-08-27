'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { magicTemplates } from '@magic-resume/resume-templates/config/magic-templates';
import { MagicResumeRenderer } from '@magic-resume/resume-templates/renderer/MagicResumeRenderer';
import {
  EditableCanvasProvider,
  pathOf,
  type EditableCanvasContextValue,
  type EditableTarget,
  type PendingChangeView,
} from '@magic-resume/resume-templates/renderer/EditableCanvas';
import {
  compile,
  critiqueTemplate,
  defaultSectionPreset,
  moveNode,
  normalizeStyles,
  outlineOf,
  setNodeHidden,
  setNodeStyle,
  techDensePreset,
  templateJsonSchema,
  validateTemplate,
  type CritiqueReport,
  type OutlineEntry,
  type TemplateDocument,
} from '@magic-resume/resume-templates/core';
// 走窄子路径而不是主 index：主 index 会把 TemplateCustomizer / registry 整套拉进来，
// 而这里只需要「把 IR 画成 HTML」这一件事。
import { renderNode as renderTreeNodeDom } from '@magic-resume/resume-templates/dom';

/**
 * 模板原语层的实验室。**仅开发环境**（生产返回 404），与 `/genui` 同一个定位。
 *
 * 存在的理由：原语层做完了但还没有任何产品入口——`templateOverride` 要手动塞进简历
 * 才看得见，设计模式只有 API 没有面板。没有这个页面，「新模板系统」这件事只能靠读测试
 * 输出来相信，而视觉验收本来就该用眼睛做。
 *
 * 这里刻意**不接真实简历数据**，用文件内的样例：改坏了不会动到用户自己的简历。
 */

const TOKENS = {
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

/** 整份简历的树：三个分区各一棵预设，拼在一个根下面 + 一个兜底节点。 */
const buildWholeResume = (): TemplateDocument => {
  const section = (key: string, title: string, icon: string, fieldMap: Record<string, string | string[]>) =>
    defaultSectionPreset({ sectionKey: key, title, fieldMap, tokens: TOKENS, iconName: icon }).root;

  return {
    version: 1,
    root: {
      id: 'resume',
      type: 'Box',
      style: [{ padding: 32, gap: 4, color: TOKENS.text, fontSize: TOKENS.bodyFontSize }],
      children: [
        {
          id: 'name',
          type: 'Text',
          role: 'title',
          value: { read: 'info.fullName' },
          style: [{ fontSize: 26, fontWeight: 700, marginBottom: 4 }],
        },
        {
          id: 'contact',
          type: 'Box',
          style: [{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12, color: '#6b7280' }],
          separator: { id: 'contact-sep', type: 'Text', value: '·', style: [{ color: '#d1d5db' }] },
          children: [{ id: 'email', type: 'Text', value: { read: 'info.email' } }],
        },
        section('experience', '工作经历', 'briefcase', {
          mainTitle: 'company',
          mainSubtitle: 'position',
          sideTitle: 'date',
          sideSubtitle: 'location',
          description: ['summary', 'description'],
        }),
        section('education', '教育经历', 'graduationCap', {
          mainTitle: 'school',
          mainSubtitle: 'major',
          sideTitle: 'date',
          description: ['summary', 'description'],
        }),
        section('projects', '项目经历', 'folderOpen', {
          mainTitle: 'name',
          mainSubtitle: 'role',
          sideTitle: 'date',
          description: ['summary', 'description'],
        }),
        {
          // 兜底：接住用户自建的分区。删掉它，自建分区就**静默消失**。
          id: 'rest',
          type: 'Box',
          each: { path: '$unhandledSections' },
          style: [{ marginTop: 12 }],
          children: [
            {
              id: 'rest-title',
              type: 'Text',
              role: 'sectionHeading',
              value: '{{item.key}}',
              style: [{ color: TOKENS.primary, fontSize: TOKENS.titleFontSize }],
            },
          ],
        },
      ],
    },
  };
};

/**
 * 内联样例。**不引 `@magic-resume/resume-schema`**——web 本来不依赖它，
 * 为一个调试页加依赖不值。而且内联的好处是我能塞一个「获奖经历」这样的
 * **自建分区**进去：它不在内建的七个 key 里，正好用来验证兜底节点真的接住了它。
 */
const resume: Record<string, unknown> = {
  info: {
    fullName: '林小雨',
    email: 'linxiaoyu@example.com',
    phone: '138-0000-0000',
    title: '多模态算法工程师 · 2026 届',
    location: '北京',
    github: 'github.com/example',
    website: 'example.dev',
  },
  sections: {
    experience: [
      {
        id: 'e1',
        company: '某某科技',
        position: '前端工程师',
        date: '2023.07 - 至今',
        location: '北京',
        summary:
          '<p><strong>项目简介：</strong>编辑器性能治理，首屏 3.2s → 1.1s。</p>' +
          '<ul><li><strong>我的职责：</strong>虚拟列表重写<ul><li>可视区外只保留占位<ul><li>滚动时复用节点池</li></ul></li></ul></li>' +
          '<li>构建拆包 + 路由预取，配合 <code>modulepreload</code></li></ul>',
      },
      {
        id: 'e2',
        company: '另一家公司',
        position: '前端实习生',
        date: '2022.06 - 2022.09',
        summary: '<p>参与组件库建设。</p>',
      },
    ],
    education: [
      { id: 'd1', school: '某某大学', major: '计算机科学与技术', date: '2019 - 2023' },
    ],
    projects: [
      {
        id: 'p1',
        name: '开源简历编辑器',
        role: '主要维护者',
        date: '2024',
        link: 'https://example.com/repo',
        summary:
          '<p>基于原语树的模板系统，一份模板同时渲染网页与 PDF。</p>' +
          '<ul><li>编译器统一 <code>each</code> / <code>when</code> 求值</li>' +
          '<li>两个后端只画不解释业务</li></ul>',
      },
    ],
    // 内建 key 之外的自建分区 → 只能靠兜底节点接住
    获奖经历: [{ id: 'a1', name: '校级一等奖学金' }],
  },
  sectionOrder: [
    { key: 'experience' },
    { key: 'education' },
    { key: 'projects' },
    { key: '获奖经历' },
  ],
};

/**
 * 对照数据的位置。**运行时 fetch，不是 import。**
 *
 * 这个文件是 gitignore 的（里面是参考件的真人内容）。若用静态 import，
 * 新克隆的仓库会因为「模块找不到」直接构建失败——一个只服务本地比对的东西
 * 不该有这种代价。fetch 的话，文件不在就只是少一个数据源。
 */
const REFERENCE_URL = '/template-lab-reference.local.json';

const legacyTemplate = Object.values(magicTemplates)[0];

const box: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  background: '#fff',
};

const PRESETS: Record<string, { label: string; build: () => TemplateDocument }> = {
  basic: { label: '基础（DefaultSection 拼装）', build: buildWholeResume },
  techDense: { label: '密集型技术简历（复刻版式）', build: () => techDensePreset() },
};

export default function TemplateLabPage() {
  const [presetKey, setPresetKey] = useState<keyof typeof PRESETS>('techDense');
  const [reference, setReference] = useState<Record<string, unknown> | null>(null);
  /*
   * 数据编辑器。
   *
   * 画布本身**不支持直接打字**——这是产品的既定分工：手动改字走左侧表单
   * （`forms/` + TiptapEditor），画布是只读预览 + AI 改写提案的入口，
   * 全仓没有一处 `contentEditable`。实验室没有那套表单，所以直接给数据本身开个口子：
   * 改 JSON，画布实时跟着变。要验的是「加了内容版式扛不扛得住」，这样最直接。
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataKey, setDataKey] = useState<'synthetic' | 'reference'>('synthetic');
  /*
   * 挂载后再画画布。
   *
   * `WysiwygContent` 在服务端**有意**返回空 div（DOMPurify 跑不了，SSR 直出未净化
   * HTML 就是 XSS 洞）。那份空壳会被水合沿用，于是正文在浏览器里也是空的——
   * 看起来像「富文本丢了」，其实是渲染时机的问题。等挂载后再画就绕开了整个 SSR。
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 拿不到就静默留在内置样例上——文件不存在是完全正常的状态，不是错误。
  useEffect(() => {
    let cancelled = false;
    fetch(REFERENCE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setReference(json as Record<string, unknown>);
        setDataKey('reference');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [doc, setDoc] = useState<TemplateDocument>(() => PRESETS.techDense.build());
  const [selected, setSelected] = useState<string | undefined>();
  const [design, setDesign] = useState(true);
  const [report, setReport] = useState<CritiqueReport | null>(null);
  const [busy, setBusy] = useState(false);

  const baseData = dataKey === 'reference' && reference ? reference : resume;
  const data = useMemo(() => {
    if (draft === null) return baseData;
    try {
      const parsed = JSON.parse(draft) as Record<string, unknown>;
      return parsed;
    } catch {
      // 打字打到一半 JSON 必然是坏的。**保持上一版可用**而不是把画布清空——
      // 每敲一个字符就白屏一次的编辑器没法用。
      return baseData;
    }
  }, [draft, baseData]);
  const compiled = useMemo(() => compile(doc, data), [doc, data]);
  const outline = useMemo(() => outlineOf(doc), [doc]);
  const validation = useMemo(() => validateTemplate(doc), [doc]);

  /*
   * 就地编辑要一个 provider 才活。
   *
   * **这个产品的「就地编辑」不是直接打字改文本**：悬停字段 → 左外侧冒出手柄 →
   * 点手柄 → AI 提出改写 → 红删绿增的评审卡 → 接受 / 丢弃 / 重来。
   * 没有 provider 时 `Editable` 渲染的是禁用态（纯文本），点了完全没反应——
   * 而且**不会有任何提示**，这正是原语层要留诊断的那类静默退化。
   *
   * 这里的 handler 是模拟的：真实产品里点手柄会发起一次模型调用，
   * 实验室只需要证明「锚点接对了、手柄能唤起、评审卡能渲染」。
   */
  const [pendingByPath, setPendingByPath] = useState<Record<string, PendingChangeView>>({});

  const proposeRewrite = (target: EditableTarget) => {
    const path = pathOf(target);
    const before = target.kind === 'html' ? '（原正文）' : target.label;
    setPendingByPath((m) => ({
      ...m,
      [path]: {
        before,
        after: `${before}（改写示例）`,
        rationale: '实验室里的模拟提案——真实产品这里是一次模型调用。',
        rationaleDetail: `锚点：${path}`,
      },
    }));
  };

  const clearPending = (path: string) =>
    setPendingByPath((m) => {
      const next = { ...m };
      delete next[path];
      return next;
    });

  const editableCtx: EditableCanvasContextValue = {
    enabled: !design,
    pendingByPath,
    processingPaths: [],
    errorsByPath: {},
    activePath: null,
    onHandleClick: (target) => proposeRewrite(target),
    onAccept: clearPending,
    onDiscard: clearPending,
    onRegenerate: () => undefined,
    onRetry: () => undefined,
    onSectionHandleClick: (sectionKey) => setSelected(sectionKey),
    /*
     * 双击手改后写回。
     *
     * 写的是 `item[fieldKey] = value`——**不解析深路径**，这是产品既有的写回契约
     * （`resumePatch.ts` 就是这么做的），第 3 期已经在校验器与编译器里两头钉死：
     * 深路径的 `write` 会被拒。这里照同一个契约写。
     */
    onCommit: (target, value) => {
      const next = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
      if (target.sectionKey === 'info') {
        (next.info as Record<string, unknown>)[target.fieldKey] = value;
      } else {
        const sections = next.sections as Record<string, Array<Record<string, unknown>>>;
        const item = sections?.[target.sectionKey]?.find((x) => String(x.id) === target.itemId);
        // 找不到条目就什么都不做。**不新建**——那会凭空造出一条经历。
        if (!item) return;
        item[target.fieldKey] = value;
      }
      setDraft(JSON.stringify(next, null, 2));
      setDataError(null);
    },
  };

  const patch = (patchObj: Record<string, unknown>) => {
    if (!selected) return;
    setDoc((d) => setNodeStyle(d, selected, patchObj));
  };

  const runCritique = async () => {
    setBusy(true);
    try {
      // 不注入 measure：这里跑的是四项纯函数检查。渲染那一项在真实产品里由浏览器
      // 用真实字体量，不是这个页面的重点。
      setReport(await critiqueTemplate(doc, data, {}));
    } finally {
      setBusy(false);
    }
  };

  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, alignItems: 'flex-start', background: '#f9fafb', minHeight: '100vh' }}>
      {/* ── 左：大纲 + 面板 ── */}
      <aside style={{ ...box, width: 320, flexShrink: 0, position: 'sticky', top: 16 }}>
        <h2 style={{ fontWeight: 700, marginBottom: 4 }}>模板实验室</h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          仅开发环境。用页面内置的样例数据，不会动到你自己的简历。
        </p>

        <select
          value={presetKey}
          onChange={(e) => {
            const k = e.target.value as keyof typeof PRESETS;
            setPresetKey(k);
            setDoc(PRESETS[k].build());
            setSelected(undefined);
            setReport(null);
          }}
          style={{ width: '100%', fontSize: 12, padding: 4, marginBottom: 10, borderRadius: 4, border: '1px solid #e5e7eb' }}
        >
          {Object.entries(PRESETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select
          value={dataKey}
          onChange={(e) => {
            setDataKey(e.target.value as 'synthetic' | 'reference');
            setDraft(null);
            setDataError(null);
            setReport(null);
          }}
          style={{ width: '100%', fontSize: 12, padding: 4, marginBottom: 10, borderRadius: 4, border: '1px solid #e5e7eb' }}
        >
          <option value="synthetic">内置样例（可进仓库）</option>
          <option value="reference" disabled={!reference}>
            {reference ? '参考件内容（本地，不进仓库）' : '参考件内容（未找到本地文件）'}
          </option>
        </select>

        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={design} onChange={(e) => setDesign(e.target.checked)} />
          设计模式（关掉切到就地编辑）
        </label>

        <div style={{ maxHeight: 260, overflow: 'auto', borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
          {outline.map((entry: OutlineEntry) => (
            <button
              key={entry.id}
              onClick={() => setSelected(entry.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                fontSize: 12,
                padding: '3px 6px',
                paddingLeft: 6 + entry.depth * 12,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: selected === entry.id ? '#dbeafe' : 'transparent',
                color: entry.hidden ? '#9ca3af' : '#111827',
                textDecoration: entry.hidden ? 'line-through' : 'none',
              }}
            >
              <span style={{ color: '#9ca3af' }}>{entry.type}</span>{' '}
              {entry.label}
              {entry.sectionKey ? <span style={{ color: '#2563eb' }}> ·{entry.sectionKey}</span> : null}
            </button>
          ))}
        </div>

        {selected && (
          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>选中：{selected}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => patch({ fontSize: 22 })}>字号 22</button>
              <button onClick={() => patch({ fontSize: null })}>重置字号</button>
              <button onClick={() => patch({ color: '#dc2626' })}>红</button>
              <button onClick={() => patch({ fontWeight: 700 })}>加粗</button>
              {/* 500 不在白名单里，点它应当**什么都不发生**——那正是要看的行为 */}
              <button onClick={() => patch({ fontWeight: 500 })}>字重 500（应无效）</button>
              <button onClick={() => setDoc((d) => setNodeHidden(d, selected, true))}>隐藏</button>
              <button onClick={() => setDoc((d) => setNodeHidden(d, selected, false))}>显示</button>
              <button onClick={() => setDoc((d) => moveNode(d, selected, -1))}>上移</button>
              <button onClick={() => setDoc((d) => moveNode(d, selected, 1))}>下移</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setDoc((d) => normalizeStyles(d).document)}>归一化样式</button>
          <button onClick={runCritique} disabled={busy}>{busy ? '检查中…' : '跑 critique'}</button>
          <button onClick={() => { setDoc(PRESETS[presetKey].build()); setReport(null); }}>重置</button>
        </div>

        <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 12, paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
            简历数据（改这里，画布实时变）
          </div>
          <textarea
            value={draft ?? JSON.stringify(baseData, null, 2)}
            onChange={(e) => {
              setDraft(e.target.value);
              try {
                JSON.parse(e.target.value);
                setDataError(null);
              } catch (err) {
                setDataError(err instanceof Error ? err.message : String(err));
              }
            }}
            spellCheck={false}
            style={{
              width: '100%',
              height: 180,
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              lineHeight: 1.5,
              padding: 8,
              borderRadius: 4,
              border: `1px solid ${dataError ? '#fca5a5' : '#e5e7eb'}`,
              resize: 'vertical',
            }}
          />
          {dataError ? (
            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>
              JSON 还不合法（画布保持上一版）：{dataError.slice(0, 80)}
            </div>
          ) : null}
          {draft !== null ? (
            <button onClick={() => { setDraft(null); setDataError(null); }} style={{ marginTop: 6 }}>
              还原数据
            </button>
          ) : null}
        </div>

        <div style={{ fontSize: 12, marginTop: 12, color: '#374151' }}>
          <div>校验：{validation.ok ? '✅ 通过' : '❌ 未通过'}（{validation.diagnostics.length} 条诊断）</div>
          <div>节点：{outline.length} · 样式字典：{Object.keys(doc.styles ?? {}).length} 条</div>
          <div>编译诊断：{compiled.diagnostics.length} 条</div>
        </div>

        {report && (
          <div style={{ fontSize: 12, marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
            <strong>{report.ok ? '✅ critique 通过' : `❌ ${report.problems.length} 个问题`}</strong>
            {report.problems.map((p, i) => (
              <div key={i} style={{ marginTop: 4, color: p.blocking ? '#b91c1c' : '#92400e' }}>
                [{p.kind}] {p.message}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── 中：原语树渲染 ── */}
      <main style={{ ...box, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          原语树 → DOM 后端
          {design
            ? '（设计模式：点上面大纲选中，选中的节点会描边；就地编辑已关）'
            : '（就地编辑：双击任意文字直接手改，回车/失焦提交、Esc 取消；悬停左边缘外的手柄则发起 AI 改写提案）'}
        </div>
        <div
          className="template-lab-canvas"
          style={{ border: '1px solid #f3f4f6', borderRadius: 6, background: '#fff' }}
        >
          {!mounted ? (
            <div style={{ padding: 24, color: '#9ca3af' }}>准备中…</div>
          ) : compiled.root ? (
            <EditableCanvasProvider value={editableCtx}>
              {renderTreeNodeDom(
                compiled.root,
                design ? { design: { selectedId: selected } } : undefined,
              )}
            </EditableCanvasProvider>
          ) : (
            <div style={{ padding: 24, color: '#b91c1c' }}>编译失败，看左侧诊断</div>
          )}
        </div>
      </main>

      {/* ── 右：legacy 对照 ── */}
      <aside style={{ ...box, width: 420, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          对照：legacy 组件路径（19 个旧模板走的就是这条，本次改动**一行没动**）
        </div>
        {/*
          对照面板也等挂载后再画。
          `WysiwygContent` 在服务端有意返回空 div（DOMPurify 跑不了，SSR 直出未净化
          HTML 是 XSS 洞），而 React **不会**修补这种不匹配——控制台会报一条很长的
          hydration mismatch，正文也留在空的那一版。挂载后再画就没有 SSR 那一步。
        */}
        <div style={{ zoom: 0.55, border: '1px solid #f3f4f6', borderRadius: 6 }}>
          {mounted ? (
            <MagicResumeRenderer template={legacyTemplate} data={data as never} locale="zh" />
          ) : null}
        </div>
      </aside>

      {/* 选中描边：`data-template-selected` 是渲染器出的，样式归页面。 */}
      <style>{`
        .template-lab-canvas [data-template-selected='true'] {
          outline: 2px solid #2563eb;
          outline-offset: 1px;
        }
        .template-lab-canvas [data-template-node]:hover {
          outline: 1px dashed #93c5fd;
        }
        aside button {
          font-size: 12px;
          padding: 3px 8px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          background: #fff;
          cursor: pointer;
        }
        aside button:hover { background: #f3f4f6; }
      `}</style>

      {/* schema 只是让它在页面上可见，方便确认导出的形状 */}
      <span hidden>{Object.keys(templateJsonSchema.$defs).join(',')}</span>
    </div>
  );
}
