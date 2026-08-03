'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import { AnimatePresence } from 'framer-motion';
import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InfoType, Resume, Section } from '@/types/frontend/resume';
import {
  EditableCanvasProvider,
  pathOf,
  type EditableTarget,
  type EditableCanvasContextValue,
  type PendingChangeView,
} from '../../lib/editableCanvas';
import ResumePreview from '../../../preview/ResumePreview';
import ActionPopover from './ActionPopover';
import ReviewBar from './ReviewBar';
import SelectionActionBar from './SelectionActionBar';
import SectionActionPopover from './SectionActionPopover';
import ChangesPanel from './ChangesPanel';
import {
  applyChangeToSections,
  applyInfoChange,
  buildElementChange,
  buildInsertChange,
  buildSelectionChange,
  finalizeAfter,
  makeInsertTarget,
  parsePath,
  reorderSection,
  sectionTitle,
  stripHtml,
  type ActionKind,
  type EditResultLike,
  type PendingChange,
  type QuickActionId,
  type SelectionActionId,
} from '../../lib/changeModel';
import { requestEdit, type EditParams } from '../../lib/services/editClient';
import {
  invalidateAiEntitlement,
  isQuotaOrCustomConfigError,
  resolveAiAccessConfig,
} from '../../lib/services/aiAccess';
import { diffResumeToChanges, type BatchKind, type TargetedSelectionDiff } from '../../lib/diffResume';

const PAGE_WIDTH = 794;
const SCALE = 0.82;

export type BatchRequest = {
  kind: BatchKind;
  lang?: string;
  nonce: number;
  /** The agent's proposed resume (from a `resume_update` event) to diff against current. */
  proposedSections?: Section;
  /** Present when a chat turn started from a text selection. */
  targetedSelection?: TargetedSelectionDiff;
};
export type FocusRequest = { path: string; nonce: number };

type LivingCanvasProps = {
  resumeData: Resume;
  templateId: string;
  onApplySections: (sections: Section) => void;
  onApplyInfo: (info: InfoType) => void;
  onLog: (text: string, resumePath?: string) => void;
  /** lift a snippet into the chat composer for a freeform instruction. */
  onAskWithTarget?: (ctx: { path: string; label: string; text: string; selectionText?: string }) => void;
  batchRequest?: BatchRequest | null;
  focusRequest?: FocusRequest | null;
};

type HighlightRect = { top: number; left: number; width: number; height: number };
type SelectionState = { target: EditableTarget; rect: DOMRect; rects: HighlightRect[]; text: string };
type SectionPopoverState = { sectionKey: string; title: string; rect: DOMRect };

// 把原始 client rects 按视觉行合并成一个。含行内元素的选区会多返回重叠的 rect，
// 两层半透明高亮叠上去会出现更深的斑块；合并后高亮才是一片均匀的颜色。
function mergeSelectionRects(raw: DOMRect[]): HighlightRect[] {
  const boxes = raw
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { top: number; bottom: number; left: number; right: number }[] = [];
  for (const r of boxes) {
    const line = lines.find((l) => r.top < l.bottom - 1 && r.bottom > l.top + 1);
    if (line) {
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
    } else {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
  }
  return lines.map((l) => ({ top: l.top, left: l.left, width: l.right - l.left, height: l.bottom - l.top }));
}

export default function LivingCanvas({
  resumeData,
  templateId,
  onApplySections,
  onApplyInfo,
  onLog,
  onAskWithTarget,
  batchRequest,
  focusRequest,
}: LivingCanvasProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Record<string, PendingChange>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [processing, setProcessing] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [popover, setPopover] = useState<{ target: EditableTarget; rect: DOMRect } | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [sectionPopover, setSectionPopover] = useState<SectionPopoverState | null>(null);
  const [cursor, setCursor] = useState(0);
  const [, setInteracted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // 用 ref 让异步回调读到最新值而不是过期闭包。
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const sectionsRef = useRef(resumeData.sections);
  sectionsRef.current = resumeData.sections;
  const infoRef = useRef(resumeData.info);
  infoRef.current = resumeData.info;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // 重试要跑一模一样的编辑，按 path 存下参数与组装函数。
  const errorAttemptsRef = useRef<
    Record<string, { params: Omit<EditParams, 'config' | 'signal'>; build: (r: EditResultLike) => PendingChange }>
  >({});
  // 按 path 记在飞行的请求：同一 path 上的新动作中止旧的，卸载/关画布则全部中止。
  const abortRef = useRef<Record<string, AbortController>>({});

  useEffect(
    () => () => {
      Object.values(abortRef.current).forEach((c) => c.abort());
    },
    []
  );

  const activePath = popover ? pathOf(popover.target) : null;

  const fieldHtml = useCallback((target: EditableTarget): string => {
    if (target.sectionKey === 'info') {
      return String((infoRef.current as Record<string, unknown>)[target.fieldKey] ?? '');
    }
    const items = sectionsRef.current[target.sectionKey];
    if (!Array.isArray(items)) return '';
    const item = items.find((it) => String(it.id) === target.itemId);
    return item ? String(item[target.fieldKey] ?? '') : '';
  }, []);

  const dropFromOrder = useCallback((path: string) => {
    setOrder((prev) => prev.filter((p) => p !== path));
  }, []);

  // popover/工具条是 fixed 定位的，画布一滚就得撤掉。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setPopover(null);
      setSelection(null);
      setSectionPopover(null);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // 点到简历和选区工具条之外就取消待处理的选区。
  useEffect(() => {
    if (!selection) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-selection-bar]') || t.closest('[data-resume-path]')) return;
      setSelection(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [selection]);

  const scrollToPath = useCallback((path: string) => {
    const el = scrollRef.current?.querySelector(`[data-resume-path="${path}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('lc-highlight');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('lc-highlight');
    window.setTimeout(() => el.classList.remove('lc-highlight'), 1200);
  }, []);

  const commit = useCallback((change: PendingChange) => {
    const path = pathOf(change.target);
    delete errorAttemptsRef.current[path];
    setErrors((prev) => {
      if (!prev[path]) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setPending((prev) => ({ ...prev, [path]: change }));
    setOrder((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  // 编辑往返：目标闪烁 → 调服务 → 成功提交提案，失败给可重试的错误。
  // 元素/选区/插入三种动作共用，保证 loading、错误、中止行为一致。
  const runEdit = useCallback(
    async (
      path: string,
      params: Omit<EditParams, 'config' | 'signal'>,
      build: (r: EditResultLike) => PendingChange
    ) => {
      const access = await resolveAiAccessConfig();
      if (!access.ok) {
        setErrors((prev) => ({
          ...prev,
          [path]:
            access.reason === 'entitlement_unavailable'
              ? access.message || '账户额度检查失败，请稍后重试'
              : '账户额度不足，请配置自定义 AI 服务后再试',
        }));
        return;
      }
      errorAttemptsRef.current[path] = { params, build };
      abortRef.current[path]?.abort();
      const ctrl = new AbortController();
      abortRef.current[path] = ctrl;
      setErrors((prev) => {
        if (!prev[path]) return prev;
        const next = { ...prev };
        delete next[path];
        return next;
      });
      setProcessing((prev) => (prev.includes(path) ? prev : [...prev, path]));
      try {
        const result = await requestEdit({ ...params, config: access.config, signal: ctrl.signal });
        commit(build(result));
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return; // user cancelled — stay quiet
        if (isQuotaOrCustomConfigError(e)) invalidateAiEntitlement();
        setErrors((prev) => ({ ...prev, [path]: (e as Error)?.message || '这处没改成，点一下重试' }));
      } finally {
        if (abortRef.current[path] === ctrl) delete abortRef.current[path];
        setProcessing((prev) => prev.filter((p) => p !== path));
      }
    },
    [commit]
  );

  const handleHandleClick = useCallback((target: EditableTarget, anchor: HTMLElement) => {
    setInteracted(true);
    setSelection(null);
    setSectionPopover(null);
    setPopover({ target, rect: anchor.getBoundingClientRect() });
  }, []);

  const runAction = useCallback(
    (action: QuickActionId | 'free', freeText?: string) => {
      if (!popover) return;
      const { target } = popover;
      setPopover(null);
      setInteracted(true);
      // 询问 Polaris → lift this element into the chat composer.
      if (action === 'free' && onAskWithTarget) {
        onAskWithTarget({ path: pathOf(target), label: target.label, text: stripHtml(fieldHtml(target)) });
        return;
      }
      const path = pathOf(target);
      const before = fieldHtml(target);
      void runEdit(
        path,
        { action, resumePath: path, before, instruction: freeText },
        (r) => buildElementChange(target, before, action, r, freeText)
      );
    },
    [popover, fieldHtml, runEdit, onAskWithTarget]
  );

  // 检测可编辑字段内的文本选区。
  const onResumeMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const startEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    const anchorEl = startEl?.closest('[data-resume-path]') as HTMLElement | null;
    const path = anchorEl?.getAttribute('data-resume-path');
    if (!path || pendingRef.current[path]) {
      setSelection(null);
      return;
    }
    const parsed = parsePath(path);
    if (!parsed) {
      setSelection(null);
      return;
    }
    const target: EditableTarget = {
      ...parsed,
      kind: parsed.sectionKey === 'info' ? 'text' : 'html',
      label: `选中片段 · ${sectionTitle(parsed.sectionKey)}`,
    };
    // 在下面清掉原生选区之前，先快照几何（每视觉行一个 rect）与文本。
    const rects = mergeSelectionRects(Array.from(range.getClientRects()));
    const boundingRect = range.getBoundingClientRect();
    const text = sel.toString();
    setPopover(null);
    setSectionPopover(null);
    setInteracted(true);
    setSelection({ target, rect: boundingRect, rects, text });
    // 鼠标一挪到浮动工具条浏览器就会清掉原生选区，所以不依赖它：现在就清掉，
    // 改用快照自绘持久高亮；动作也走存下来的 text 而非实时选区。
    sel.removeAllRanges();
  }, []);

  const runSelectionAction = useCallback(
    (action: SelectionActionId | 'free', freeText?: string) => {
      const sel = selectionRef.current;
      if (!sel) return;
      const { target, text } = sel;
      setSelection(null);
      // 询问 Polaris → 把选中片段抬进输入框作为上下文；对话结果稍后 diff 回同一 path。
      if (action === 'free' && onAskWithTarget) {
        onAskWithTarget({ path: pathOf(target), label: target.label, text, selectionText: text });
        return;
      }
      const path = pathOf(target);
      const fullHtml = fieldHtml(target);
      void runEdit(
        path,
        { action, resumePath: path, before: fullHtml, selectionText: text, instruction: freeText },
        (r) => buildSelectionChange(target, fullHtml, text, action, r, { freeText })
      );
    },
    [fieldHtml, runEdit, onAskWithTarget]
  );

  // 模块标题上的手柄 → 新增条目 / 重排。
  const onSectionHandleClick = useCallback((sectionKey: string, title: string, anchor: HTMLElement) => {
    setInteracted(true);
    setPopover(null);
    setSelection(null);
    setSectionPopover({ sectionKey, title, rect: anchor.getBoundingClientRect() });
  }, []);

  const addItem = useCallback(
    (sectionKey: string, title: string) => {
      setSectionPopover(null);
      const target = makeInsertTarget(sectionKey, title);
      const path = pathOf(target);
      void runEdit(
        path,
        {
          action: 'insert',
          resumePath: `sections.${sectionKey}`,
          before: '',
          // 给模型看的隐藏指令按约定用英文；生成的内容跟随该模块自身语言。
          instruction: `Add one new bullet under "${title}" matching the section's existing style and language, quantifiable where honest.`,
        },
        (r) => buildInsertChange(target, r)
      );
    },
    [runEdit]
  );

  const reorder = useCallback(
    (sectionKey: string, title: string) => {
      setSectionPopover(null);
      const next = reorderSection(sectionsRef.current, sectionKey);
      if (next === sectionsRef.current) return;
      onApplySections(next);
      onLog(`已调整顺序 · ${title}`);
    },
    [onApplySections, onLog]
  );

  const accept = useCallback(
    (path: string) => {
      const change = pendingRef.current[path];
      if (!change) return;
      // 同步更新 ref 而不只调 setter：同一 tick 内连按两次接受，否则两次都读到接受前的
      // 快照，第二次会把第一次的结果吃掉。
      if (change.target.sectionKey === 'info') {
        const nextInfo = applyInfoChange(infoRef.current, change);
        infoRef.current = nextInfo;
        onApplyInfo(nextInfo);
      } else {
        const nextSections = applyChangeToSections(sectionsRef.current, change);
        sectionsRef.current = nextSections;
        onApplySections(nextSections);
      }
      onLog(
        change.isInsert
          ? `已新增 · ${sectionTitle(change.target.sectionKey)}`
          : `已改写 · ${change.target.label}`,
        path
      );
      setPending((prev) => ({ ...prev, [path]: { ...change, status: 'accepted' } }));
      dropFromOrder(path);
      window.setTimeout(() => {
        setPending((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
      }, 420);
    },
    [onApplySections, onApplyInfo, onLog, dropFromOrder]
  );

  const discard = useCallback(
    (path: string) => {
      setPending((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      dropFromOrder(path);
    },
    [dropFromOrder]
  );

  // 「再来一版」：同一意图加一句换写法的提示重跑，只替换现有提案的文本，保留 id/target/path。
  const regenerate = useCallback((path: string) => {
    const change = pendingRef.current[path];
    if (!change) return;
    abortRef.current[path]?.abort();
    const ctrl = new AbortController();
    abortRef.current[path] = ctrl;
    setProcessing((prev) => (prev.includes(path) ? prev : [...prev, path]));
    resolveAiAccessConfig()
      .then((access) => {
        if (!access.ok) {
          throw new Error(
            access.reason === 'entitlement_unavailable'
              ? access.message || '账户额度检查失败，请稍后重试'
              : '账户额度不足，请配置自定义 AI 服务后再试',
          );
        }
        return requestEdit({
          action: change.isInsert ? 'insert' : (change.action as ActionKind),
          resumePath: pathOf(change.target),
          before: change.before,
          selectionText: change.selectionText,
          // 隐藏提示用英文；用户自由输入可以是任何语言。
          instruction: [change.freeText, 'try a different phrasing'].filter(Boolean).join('; '),
          lang: change.lang,
          config: access.config,
          signal: ctrl.signal,
        });
      })
      .then((r) => {
        setPending((prev) =>
          prev[path]
            ? {
                ...prev,
                [path]: {
                  ...prev[path],
                  after: finalizeAfter(change.target.kind, r.after),
                  rationale: r.rationale,
                  rationaleDetail: r.rationaleDetail,
                },
              }
            : prev
        );
      })
      .catch((e) => {
        if ((e as Error)?.name === 'AbortError') return;
        if (isQuotaOrCustomConfigError(e)) invalidateAiEntitlement();
        setErrors((prev) => ({ ...prev, [path]: (e as Error)?.message || '再来一版没成，点一下重试' }));
      })
      .finally(() => {
        if (abortRef.current[path] === ctrl) delete abortRef.current[path];
        setProcessing((prev) => prev.filter((p) => p !== path));
      });
  }, []);

  const retry = useCallback(
    (path: string) => {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      const attempt = errorAttemptsRef.current[path];
      if (attempt) void runEdit(path, attempt.params, attempt.build);
    },
    [runEdit]
  );

  const acceptAll = useCallback(() => {
    const changes = order.map((p) => pendingRef.current[p]).filter(Boolean) as PendingChange[];
    if (!changes.length) return;
    // Suggestions were actually taken into the résumé. This is the outcome that
    // says whether the AI was useful; a run that merely finished does not.
    appLifecycle.aiOptimizationApplied({ changes: changes.length });
    let nextSections = sectionsRef.current;
    let nextInfo = infoRef.current;
    let infoTouched = false;
    for (const c of changes) {
      if (c.target.sectionKey === 'info') {
        nextInfo = applyInfoChange(nextInfo, c);
        infoTouched = true;
      } else {
        nextSections = applyChangeToSections(nextSections, c);
      }
    }
    onApplySections(nextSections);
    if (infoTouched) onApplyInfo(nextInfo);
    onLog(t('aiLab.living.acceptedChangesLog', { count: changes.length }));
    setPending({});
    setOrder([]);
    setCursor(0);
    setPanelOpen(false);
  }, [order, onApplySections, onApplyInfo, onLog, t]);

  const discardAll = useCallback(() => {
    setPending({});
    setOrder([]);
    setCursor(0);
    setPanelOpen(false);
  }, []);

  const goTo = useCallback(
    (dir: 1 | -1) => {
      if (order.length === 0) return;
      const nextCursor = (cursor + dir + order.length) % order.length;
      setCursor(nextCursor);
      scrollToPath(order[nextCursor]);
    },
    [cursor, order, scrollToPath]
  );

  // Keyboard review shortcuts — only while reviewing and no overlay is open.
  useEffect(() => {
    if (order.length === 0 || popover || selection || sectionPopover) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        acceptAll();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        goTo(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const path = order[Math.min(cursor, order.length - 1)];
        if (path) accept(path);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const path = order[Math.min(cursor, order.length - 1)];
        if (path) discard(path);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [order, cursor, popover, selection, sectionPopover, acceptAll, goTo, accept, discard]);

  // P3 · a whole-resume skill seeds a batch of in-place changes (replaces the old Diff tab).
  const lastBatchNonce = useRef<number>(0);
  useEffect(() => {
    if (!batchRequest || batchRequest.nonce === lastBatchNonce.current) return;
    lastBatchNonce.current = batchRequest.nonce;
    if (!batchRequest.proposedSections) return;
    const changes = diffResumeToChanges(
      sectionsRef.current,
      batchRequest.proposedSections,
      batchRequest.kind,
      batchRequest.lang,
      batchRequest.targetedSelection
    );
    if (!changes.length) return;
    const entries = changes.map((c) => ({ path: pathOf(c.target), change: c }));
    const paths = entries.map((e) => e.path);
    setInteracted(true);
    setProcessing((prev) => [...prev, ...paths.filter((p) => !prev.includes(p))]);
    window.setTimeout(() => {
      setProcessing((prev) => prev.filter((p) => !paths.includes(p)));
      setPending((prev) => {
        const next = { ...prev };
        for (const { path, change } of entries) next[path] = change;
        return next;
      });
      setOrder((prev) => [...prev, ...paths.filter((p) => !prev.includes(p))]);
      setCursor(0);
    }, 1000);
  }, [batchRequest]);

  // Click a conversation log entry → jump to that spot on the canvas. The resume
  // template renders async on (re)mount, so poll briefly until the node exists.
  const lastFocusNonce = useRef<number>(0);
  useEffect(() => {
    if (!focusRequest || focusRequest.nonce === lastFocusNonce.current) return;
    lastFocusNonce.current = focusRequest.nonce;
    const { path } = focusRequest;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const el = scrollRef.current?.querySelector(`[data-resume-path="${path}"]`);
      if (el) {
        scrollToPath(path);
      } else if (tries++ < 14) {
        timer = setTimeout(attempt, 120);
      }
    };
    timer = setTimeout(attempt, 60);
    return () => clearTimeout(timer);
  }, [focusRequest, scrollToPath]);


  // §10 · if the source diverges from a pending change's `before`, the user hand-edited
  // it elsewhere → treat that as discarding the proposal.
  useEffect(() => {
    const current = pendingRef.current;
    const stale = Object.entries(current).filter(([, c]) => {
      if (c.status === 'accepted' || c.isInsert) return false;
      return fieldHtml(c.target) !== c.before;
    });
    if (stale.length === 0) return;
    const stalePaths = new Set(stale.map(([p]) => p));
    setPending((prev) => {
      const next = { ...prev };
      for (const p of stalePaths) delete next[p];
      return next;
    });
    setOrder((prev) => prev.filter((p) => !stalePaths.has(p)));
  }, [resumeData.sections, resumeData.info, fieldHtml]);

  const pendingByPath = useMemo<Record<string, PendingChangeView>>(() => {
    const out: Record<string, PendingChangeView> = {};
    for (const [path, c] of Object.entries(pending)) {
      out[path] = {
        before: c.before,
        after: c.after,
        rationale: c.rationale,
        rationaleDetail: c.rationaleDetail,
        status: c.status,
        isInsert: c.isInsert,
      };
    }
    return out;
  }, [pending]);

  const ctxValue = useMemo<EditableCanvasContextValue>(
    () => ({
      enabled: true,
      pendingByPath,
      processingPaths: processing,
      errorsByPath: errors,
      activePath,
      onHandleClick: handleHandleClick,
      onAccept: accept,
      onDiscard: discard,
      onRegenerate: regenerate,
      onRetry: retry,
      onSectionHandleClick,
    }),
    [pendingByPath, processing, errors, activePath, handleHandleClick, accept, discard, regenerate, retry, onSectionHandleClick]
  );

  const count = order.length;

  const changeRows = useMemo(
    () =>
      order
        .map((path) => {
          const c = pending[path];
          if (!c) return null;
          return { path, label: c.target.label, rationale: c.rationale, isInsert: c.isInsert };
        })
        .filter(Boolean) as { path: string; label: string; rationale: string; isInsert?: boolean }[],
    [order, pending]
  );

  const jumpTo = useCallback(
    (path: string) => {
      setPanelOpen(false);
      const idx = order.indexOf(path);
      if (idx >= 0) setCursor(idx);
      scrollToPath(path);
    },
    [order, scrollToPath]
  );

  return (
    <div className="relative flex flex-col h-full min-w-0 bg-neutral-900/25">
      {count > 0 && (
        <div className="flex items-center px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-neutral-300 border border-neutral-800 hover:border-neutral-700 rounded-full px-2.5 py-1 transition-colors cursor-pointer"
          >
            <ListChecks size={12} />
            {t('aiLab.living.changeCountShort', { count })}
          </button>
        </div>
      )}

      <AnimatePresence>
        {panelOpen && (
          <ChangesPanel
            rows={changeRows}
            onJump={jumpTo}
            onAcceptAll={acceptAll}
            onDiscardAll={discardAll}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        onMouseUp={onResumeMouseUp}
        className="relative flex-1 overflow-auto custom-scrollbar"
      >
        <div className="flex justify-center pt-6 pb-24 px-12">
          <div style={{ width: PAGE_WIDTH * SCALE }}>
            <div
              className="bg-[#fff] rounded-lg shadow-2xl"
              style={{
                width: PAGE_WIDTH,
                transform: `scale(${SCALE})`,
                transformOrigin: 'top left',
                overflow: 'visible',
              }}
            >
              <EditableCanvasProvider value={ctxValue}>
                <div style={{ padding: 4 }}>
                  <ResumePreview
                    info={resumeData.info}
                    sections={resumeData.sections}
                    sectionOrder={resumeData.sectionOrder.map((s) => s.key)}
                    templateId={templateId}
                  />
                </div>
              </EditableCanvasProvider>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {count > 0 && (
          <ReviewBar
            count={count}
            onPrev={() => goTo(-1)}
            onNext={() => goTo(1)}
            onAcceptAll={acceptAll}
            onDiscardAll={discardAll}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {popover && (
          <ActionPopover
            key={pathOf(popover.target)}
            target={popover.target}
            anchorRect={popover.rect}
            onRun={runAction}
            onClose={() => setPopover(null)}
          />
        )}
      </AnimatePresence>

      {/* Persistent highlight for the captured selection — replaces the native
          one so the marked snippet stays lit while the cursor is on the toolbar. */}
      {selection && (
        <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 115, pointerEvents: 'none' }}>
          {selection.rects.map((r, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                background: 'rgba(56,189,248,0.28)',
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selection && (
          <SelectionActionBar
            rect={selection.rect}
            onRun={runSelectionAction}
            onClose={() => setSelection(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sectionPopover && (
          <SectionActionPopover
            title={sectionPopover.title}
            anchorRect={sectionPopover.rect}
            onAdd={() => addItem(sectionPopover.sectionKey, sectionPopover.title)}
            onReorder={() => reorder(sectionPopover.sectionKey, sectionPopover.title)}
            onClose={() => setSectionPopover(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
