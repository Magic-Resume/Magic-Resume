"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { appLifecycle } from "@/lib/extensions/app-lifecycle";
import { AnimatePresence } from "framer-motion";
import { ListChecks } from '@magic-resume/icons';
import { useTranslation } from "react-i18next";
import { InfoType, Resume, Section } from "@/types/frontend/resume";
import {
  EditableCanvasProvider,
  pathOf,
  type EditableTarget,
  type EditableCanvasContextValue,
  type PendingChangeView,
} from "../../lib/editableCanvas";
import { partitionByAnchor, toPendingView } from "../../lib/pendingView";
import ResumePreview from "../../../preview/ResumePreview";
import AiThinkingOverlay from "../../../modals/AiThinkingOverlay";
import ActionPopover from "./ActionPopover";
import ReviewBar from "./ReviewBar";
import SelectionActionBar from "./SelectionActionBar";
import SectionActionPopover from "./SectionActionPopover";
import ChangesPanel from "./ChangesPanel";
import {
  applyChangeToSections,
  applyInfoChange,
  buildElementChange,
  buildInsertChange,
  buildSelectionChange,
  finalizeAfter,
  fieldTitle,
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
} from "../../lib/changeModel";
import { requestEdit, type EditParams } from "../../lib/services/editClient";
import { memoryApi } from "@/lib/api/memoryApi";
import {
  invalidateAiEntitlement,
  isQuotaOrCustomConfigError,
  resolveAiAccessConfig,
} from "../../lib/services/aiAccess";
import {
  diffResumeToChanges,
  type BatchKind,
  type TargetedSelectionDiff,
} from "../../lib/diffResume";
import type {
  WorkspaceProposalChange,
  WorkspaceResolution,
} from "@/lib/api/workspace";

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
  /** 模型给的逐字段改动理由，键为 `section/itemId/fieldKey`（`explain_changes`）。 */
  changeNotes?: Map<string, string>;
  /** Server-prepared, CAS-addressable V2 proposal changes. */
  workspaceChanges?: PendingChange[];
  workspaceProposalId?: string;
};
export type FocusRequest = { path: string; nonce: number };

/**
 * Platform has already validated these targets against the encrypted proposal.
 * This adapter only gives LivingCanvas enough presentation data to review them;
 * accept/reject stays server-side through `workspaceChangeId`.
 */
export function workspaceChangesToPending(
  changes: WorkspaceProposalChange[],
  baseResume: Record<string, unknown>,
): PendingChange[] {
  return changes
    .filter((change) => change.status === "PENDING")
    .map((change) => {
      const target = change.target;
      if (target.scope === "info") {
        const before = readWorkspaceValue(baseResume, target);
        return {
          id: change.id,
          workspaceChangeId: change.id,
          target: {
            sectionKey: "info",
            itemId: "",
            fieldKey: target.fieldKey,
            kind: kindFor(change.after),
            label: fieldTitle(target.fieldKey),
          },
          before: previewValue(before),
          after: previewValue(change.after),
          rationale: "",
          action: "rewrite",
          seed: 0,
          status: "pending",
        } satisfies PendingChange;
      }
      if (target.scope === "sectionItem") {
        const before = readWorkspaceValue(baseResume, target);
        return {
          id: change.id,
          workspaceChangeId: change.id,
          target: {
            sectionKey: target.sectionKey,
            itemId: target.itemId,
            fieldKey: target.fieldKey,
            kind: kindFor(change.after),
            label: `${sectionTitle(target.sectionKey)} · ${fieldTitle(target.fieldKey)}`,
          },
          before: previewValue(before),
          after: previewValue(change.after),
          rationale: "",
          action: "rewrite",
          seed: 0,
          status: "pending",
        } satisfies PendingChange;
      }
      if (target.scope === "section") {
        const after = previewValue(change.after);
        return {
          id: change.id,
          workspaceChangeId: change.id,
          target: {
            sectionKey: target.sectionKey,
            itemId: target.itemId,
            fieldKey: "summary",
            kind: kindFor(after),
            label: `${sectionTitle(target.sectionKey)} · ${change.action === "INSERT" ? "新增条目" : "移除条目"}`,
          },
          before: previewValue(readWorkspaceValue(baseResume, target)),
          after,
          rationale: "",
          action: "rewrite",
          isInsert: change.action === "INSERT",
          seed: 0,
          status: "pending",
        } satisfies PendingChange;
      }
      return {
        id: change.id,
        workspaceChangeId: change.id,
        target: {
          sectionKey: "info",
          itemId: "",
          fieldKey: "sectionOrder",
          kind: "text",
          label: "Section order",
        },
        before: previewValue(baseResume.sectionOrder),
        after: previewValue(change.after),
        rationale: "",
        action: "rewrite",
        seed: 0,
        status: "pending",
      } satisfies PendingChange;
    });
}

function readWorkspaceValue(
  resume: Record<string, unknown>,
  target: WorkspaceProposalChange["target"],
): unknown {
  if (target.scope === "info") {
    const info = resume.info;
    return info && typeof info === "object" && !Array.isArray(info)
      ? (info as Record<string, unknown>)[target.fieldKey]
      : undefined;
  }
  if (target.scope === "sectionOrder") return resume.sectionOrder;
  const sections = resume.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return undefined;
  const items = (sections as Record<string, unknown>)[target.sectionKey];
  if (!Array.isArray(items)) return undefined;
  const item = items.find(
    (entry) => entry && typeof entry === "object" && (entry as { id?: unknown }).id === target.itemId,
  ) as Record<string, unknown> | undefined;
  return target.scope === "section" ? item : item?.[target.fieldKey];
}

function previewValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function kindFor(value: unknown): EditableTarget["kind"] {
  return /<[a-z][\s\S]*>/i.test(previewValue(value)) ? "html" : "text";
}

type LivingCanvasProps = {
  resumeData: Resume;
  templateId: string;
  onApplySections: (sections: Section) => void;
  onApplyInfo: (info: InfoType) => void;
  onLog: (text: string, resumePath?: string, tone?: "ok" | "info") => void;
  /**
   * 一次改动没能落到画布上时说一句。与 onLog 分开：那条记「做成了」，这条记「没做成」。
   * `reason` 是可枚举的拦截层——它同时进遥测，要能直接分组指向该修哪一处。
   */
  onWarn: (
    text: string,
    reason: "unmatched_items" | "no_changes" | "no_anchor" | "apply_failed",
    extra?: { count?: number; detail?: unknown },
  ) => void;
  /** lift a snippet into the chat composer for a freeform instruction. */
  onAskWithTarget?: (ctx: {
    path: string;
    label: string;
    text: string;
    selectionText?: string;
  }) => void;
  batchRequest?: BatchRequest | null;
  focusRequest?: FocusRequest | null;
  /**
   * 一份还没落地的草稿（引导创建的产物）。给了就渲染它而不是当前简历，并关掉就地
   * 编辑——还没应用的东西不该能改。用户点「应用到简历」后它变成 resumeData，同一张
   * 纸无缝接上，不用换面板。
   */
  previewResume?: Resume | null;
  /**
   * 整张纸都在被写、且还没有东西可看时压一层「纸面入定」（与主编辑器预览共用同一
   * 个遮罩）。**不要**在定向改写时置位：那种情况下设计要的是被作用的片段就地
   * shimmer、不锁全屏（living-canvas design §5C），盖一层全纸遮罩会把它盖掉。
   */
  working?: boolean;
  /** Resolves Workspace changes server-side and returns the canonical resume. */
  onResolveWorkspace?: (
    proposalId: string,
    decisions: { accept?: string[]; reject?: string[] },
  ) => Promise<WorkspaceResolution>;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};
type SelectionState = {
  target: EditableTarget;
  rect: DOMRect;
  rects: HighlightRect[];
  text: string;
};
type SectionPopoverState = { sectionKey: string; title: string; rect: DOMRect };

// 把原始 client rects 按视觉行合并成一个。含行内元素的选区会多返回重叠的 rect，
// 两层半透明高亮叠上去会出现更深的斑块；合并后高亮才是一片均匀的颜色。
function mergeSelectionRects(raw: DOMRect[]): HighlightRect[] {
  const boxes = raw
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { top: number; bottom: number; left: number; right: number }[] =
    [];
  for (const r of boxes) {
    const line = lines.find(
      (l) => r.top < l.bottom - 1 && r.bottom > l.top + 1,
    );
    if (line) {
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
    } else {
      lines.push({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
      });
    }
  }
  return lines.map((l) => ({
    top: l.top,
    left: l.left,
    width: l.right - l.left,
    height: l.bottom - l.top,
  }));
}

function LivingCanvas({
  resumeData,
  templateId,
  onApplySections,
  onApplyInfo,
  onLog,
  onWarn,
  onAskWithTarget,
  batchRequest,
  focusRequest,
  previewResume,
  working,
  onResolveWorkspace,
}: LivingCanvasProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Record<string, PendingChange>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [processing, setProcessing] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [popover, setPopover] = useState<{
    target: EditableTarget;
    rect: DOMRect;
  } | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [sectionPopover, setSectionPopover] =
    useState<SectionPopoverState | null>(null);
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
  // Batch timers must not restart merely because a parent callback gets a new identity.
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;
  const onWarnRef = useRef(onWarn);
  onWarnRef.current = onWarn;
  // 重试要跑一模一样的编辑，按 path 存下参数与组装函数。
  const errorAttemptsRef = useRef<
    Record<
      string,
      {
        params: Omit<EditParams, "config" | "signal">;
        build: (r: EditResultLike) => PendingChange;
      }
    >
  >({});
  // 按 path 记在飞行的请求：同一 path 上的新动作中止旧的，卸载/关画布则全部中止。
  const abortRef = useRef<Record<string, AbortController>>({});

  useEffect(
    () => () => {
      Object.values(abortRef.current).forEach((c) => c.abort());
    },
    [],
  );

  const activePath = popover ? pathOf(popover.target) : null;
  // 纸上画什么：优先未落地的草稿，否则是真简历。
  const shown = previewResume ?? resumeData;

  const fieldHtml = useCallback((target: EditableTarget): string => {
    if (target.sectionKey === "info") {
      return String(
        (infoRef.current as Record<string, unknown>)[target.fieldKey] ?? "",
      );
    }
    const items = sectionsRef.current[target.sectionKey];
    if (!Array.isArray(items)) return "";
    const item = items.find((it) => String(it.id) === target.itemId);
    return item ? String(item[target.fieldKey] ?? "") : "";
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
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 点到简历和选区工具条之外就取消待处理的选区。
  useEffect(() => {
    if (!selection) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-selection-bar]") || t.closest("[data-resume-path]"))
        return;
      setSelection(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [selection]);

  const scrollToPath = useCallback((path: string) => {
    const el = scrollRef.current?.querySelector(`[data-resume-path="${path}"]`);
    if (!el) return;
    // matchMedia 而不是 useReducedMotion：这在 callback 里，且只读一次即可。
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    el.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
    });
    el.classList.remove("lc-highlight");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("lc-highlight");
    window.setTimeout(() => el.classList.remove("lc-highlight"), 1200);
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
      params: Omit<EditParams, "config" | "signal">,
      build: (r: EditResultLike) => PendingChange,
    ) => {
      const access = await resolveAiAccessConfig();
      if (!access.ok) {
        setErrors((prev) => ({
          ...prev,
          [path]:
            access.reason === "entitlement_unavailable"
              ? access.message || "账户额度检查失败，请稍后重试"
              : "账户额度不足，请配置自定义 AI 服务后再试",
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
        const result = await requestEdit({
          ...params,
          config: access.config,
          signal: ctrl.signal,
        });
        commit(build(result));
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // user cancelled — stay quiet
        if (isQuotaOrCustomConfigError(e)) invalidateAiEntitlement();
        setErrors((prev) => ({
          ...prev,
          [path]: (e as Error)?.message || "这处没改成，点一下重试",
        }));
      } finally {
        if (abortRef.current[path] === ctrl) delete abortRef.current[path];
        setProcessing((prev) => prev.filter((p) => p !== path));
      }
    },
    [commit],
  );

  const handleHandleClick = useCallback(
    (target: EditableTarget, anchor: HTMLElement) => {
      setInteracted(true);
      setSelection(null);
      setSectionPopover(null);
      setPopover({ target, rect: anchor.getBoundingClientRect() });
    },
    [],
  );

  const runAction = useCallback(
    (action: QuickActionId | "free", freeText?: string) => {
      if (!popover) return;
      const { target } = popover;
      setPopover(null);
      setInteracted(true);
      // 询问 Polaris → lift this element into the chat composer.
      if (action === "free" && onAskWithTarget) {
        onAskWithTarget({
          path: pathOf(target),
          label: target.label,
          text: stripHtml(fieldHtml(target)),
        });
        return;
      }
      const path = pathOf(target);
      const before = fieldHtml(target);
      void runEdit(
        path,
        { action, resumePath: path, before, instruction: freeText },
        (r) => buildElementChange(target, before, action, r, freeText),
      );
    },
    [popover, fieldHtml, runEdit, onAskWithTarget],
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
    const startEl =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    const anchorEl = startEl?.closest(
      "[data-resume-path]",
    ) as HTMLElement | null;
    const path = anchorEl?.getAttribute("data-resume-path");
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
      kind: parsed.sectionKey === "info" ? "text" : "html",
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
    (action: SelectionActionId | "free", arg?: string) => {
      // `arg` 对 free 是自由指令，对 translate 是目标语言（此前不带,模型只能猜）。
      const freeText = action === "free" ? arg : undefined;
      const lang = action === "translate" ? arg : undefined;
      const sel = selectionRef.current;
      if (!sel) return;
      const { target, text } = sel;
      setSelection(null);
      // 询问 Polaris → 把选中片段抬进输入框作为上下文；对话结果稍后 diff 回同一 path。
      if (action === "free" && onAskWithTarget) {
        onAskWithTarget({
          path: pathOf(target),
          label: target.label,
          text,
          selectionText: text,
        });
        return;
      }
      const path = pathOf(target);
      const fullHtml = fieldHtml(target);
      void runEdit(
        path,
        {
          action,
          resumePath: path,
          before: fullHtml,
          selectionText: text,
          instruction: freeText,
          lang,
        },
        (r) =>
          buildSelectionChange(target, fullHtml, text, action, r, {
            freeText,
            lang,
          }),
      );
    },
    [fieldHtml, runEdit, onAskWithTarget],
  );

  // 模块标题上的手柄 → 新增条目 / 重排。
  const onSectionHandleClick = useCallback(
    (sectionKey: string, title: string, anchor: HTMLElement) => {
      setInteracted(true);
      setPopover(null);
      setSelection(null);
      setSectionPopover({
        sectionKey,
        title,
        rect: anchor.getBoundingClientRect(),
      });
    },
    [],
  );

  const addItem = useCallback(
    (sectionKey: string, title: string) => {
      setSectionPopover(null);
      const target = makeInsertTarget(sectionKey, title);
      const path = pathOf(target);
      void runEdit(
        path,
        {
          action: "insert",
          resumePath: `sections.${sectionKey}`,
          before: "",
          // 给模型看的隐藏指令按约定用英文；生成的内容跟随该模块自身语言。
          instruction: `Add one new bullet under "${title}" matching the section's existing style and language, quantifiable where honest.`,
        },
        (r) => buildInsertChange(target, r),
      );
    },
    [runEdit],
  );

  const reorder = useCallback(
    (sectionKey: string, title: string) => {
      setSectionPopover(null);
      const next = reorderSection(sectionsRef.current, sectionKey);
      if (next === sectionsRef.current) return;
      onApplySections(next);
      onLog(`已调整顺序 · ${title}`);
    },
    [onApplySections, onLog],
  );

  const accept = useCallback(
    (path: string) => {
      const change = pendingRef.current[path];
      if (!change) return;
      const workspaceProposalId = batchRequest?.workspaceProposalId;
      if (change.workspaceChangeId && workspaceProposalId && onResolveWorkspace) {
        setProcessing((prev) => [...new Set([...prev, path])]);
        void onResolveWorkspace(workspaceProposalId, {
          accept: [change.workspaceChangeId],
        })
          .then((result) => {
            const conflicted = result.conflicts.some(
              (conflict) => conflict.changeId === change.workspaceChangeId,
            );
            if (conflicted) {
              setErrors((prev) => ({ ...prev, [path]: "此处已被其他编辑改动，请刷新后重新选择" }));
              return;
            }
            onLog(`已应用 · ${change.target.label}`, path);
            setPending((prev) => {
              const next = { ...prev };
              delete next[path];
              return next;
            });
            dropFromOrder(path);
          })
          .catch((error) => {
            setErrors((prev) => ({ ...prev, [path]: (error as Error)?.message || "应用失败，请重试" }));
          })
          .finally(() => setProcessing((prev) => prev.filter((item) => item !== path)));
        return;
      }
      // 同步更新 ref 而不只调 setter：同一 tick 内连按两次接受，否则两次都读到接受前的
      // 快照，第二次会把第一次的结果吃掉。
      if (change.target.sectionKey === "info") {
        const nextInfo = applyInfoChange(infoRef.current, change);
        infoRef.current = nextInfo;
        onApplyInfo(nextInfo);
      } else {
        const { sections: nextSections, applied } = applyChangeToSections(
          sectionsRef.current,
          change,
        );
        // 写不进去就把卡片留在原地并标红，绝不假装成功。此前这里无条件往下走：卡片消失、
        // 日志写「已改写」、420ms 后移除，而 store 一个字都没变。
        if (!applied) {
          onWarn(
            `这条改动没能写进简历 · ${change.target.label}`,
            "apply_failed",
            { count: 1, detail: change.target },
          );
          setErrors((prev) => ({ ...prev, [path]: "写入失败，请重试" }));
          return;
        }
        sectionsRef.current = nextSections;
        onApplySections(nextSections);
      }
      onLog(
        change.isInsert
          ? `已新增 · ${sectionTitle(change.target.sectionKey)}`
          : `已改写 · ${change.target.label}`,
        path,
      );
      setPending((prev) => ({
        ...prev,
        [path]: { ...change, status: "accepted" },
      }));
      dropFromOrder(path);
      window.setTimeout(() => {
        setPending((prev) => {
          const next = { ...prev };
          delete next[path];
          return next;
        });
        // 与 globals.css `.lc-flash` 的时长成对：这里先摘掉,绿闪就播不完。
      }, 420);
    },
    [batchRequest?.workspaceProposalId, onResolveWorkspace, onApplySections, onApplyInfo, onLog, onWarn, dropFromOrder],
  );

  const discard = useCallback(
    (path: string) => {
      const change = pendingRef.current[path];
      const workspaceProposalId = batchRequest?.workspaceProposalId;
      if (change?.workspaceChangeId && workspaceProposalId && onResolveWorkspace) {
        setProcessing((prev) => [...new Set([...prev, path])]);
        void onResolveWorkspace(workspaceProposalId, {
          reject: [change.workspaceChangeId],
        })
          .then(() => {
            setPending((prev) => {
              const next = { ...prev };
              delete next[path];
              return next;
            });
            dropFromOrder(path);
          })
          .catch((error) => {
            setErrors((prev) => ({ ...prev, [path]: (error as Error)?.message || "拒绝失败，请重试" }));
          })
          .finally(() => setProcessing((prev) => prev.filter((item) => item !== path)));
        return;
      }
      // 拒绝一条提案是用户**唯一主动表达的改写偏好**——此前它说完就没了，下次 AI 原样
      // 再提一遍。按动作记（不是按路径）：「他反复拒绝加量化」能泛化到整份简历。
      //
      // 不 await、失败不报：这是旁路记录，不该让一次「不要」卡在网络上。
      const action = change?.action;
      if (action) void memoryApi.recordRejection(action).catch(() => undefined);

      setPending((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      dropFromOrder(path);
    },
    [batchRequest?.workspaceProposalId, onResolveWorkspace, dropFromOrder],
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
            access.reason === "entitlement_unavailable"
              ? access.message || "账户额度检查失败，请稍后重试"
              : "账户额度不足，请配置自定义 AI 服务后再试",
          );
        }
        return requestEdit({
          action: change.isInsert ? "insert" : (change.action as ActionKind),
          resumePath: pathOf(change.target),
          before: change.before,
          selectionText: change.selectionText,
          // 隐藏提示用英文；用户自由输入可以是任何语言。
          instruction: [change.freeText, "try a different phrasing"]
            .filter(Boolean)
            .join("; "),
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
            : prev,
        );
      })
      .catch((e) => {
        if ((e as Error)?.name === "AbortError") return;
        if (isQuotaOrCustomConfigError(e)) invalidateAiEntitlement();
        setErrors((prev) => ({
          ...prev,
          [path]: (e as Error)?.message || "再来一版没成，点一下重试",
        }));
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
    [runEdit],
  );

  const acceptAll = useCallback(() => {
    const changes = order
      .map((p) => pendingRef.current[p])
      .filter(Boolean) as PendingChange[];
    if (!changes.length) return;
    const workspaceProposalId = batchRequest?.workspaceProposalId;
    const workspaceIds = changes
      .map((change) => change.workspaceChangeId)
      .filter((id): id is string => Boolean(id));
    if (workspaceProposalId && workspaceIds.length && onResolveWorkspace) {
      setProcessing((prev) => [...new Set([...prev, ...order])]);
      void onResolveWorkspace(workspaceProposalId, { accept: workspaceIds })
        .then((result) => {
          const conflicts = new Set(result.conflicts.map((conflict) => conflict.changeId));
          const resolvedPaths = changes
            .filter((change) => !change.workspaceChangeId || !conflicts.has(change.workspaceChangeId))
            .map((change) => pathOf(change.target));
          if (conflicts.size) {
            setErrors((prev) => ({
              ...prev,
              ...Object.fromEntries(
                changes
                  .filter((change) => change.workspaceChangeId && conflicts.has(change.workspaceChangeId))
                  .map((change) => [pathOf(change.target), "此处已被其他编辑改动，请刷新后重新选择"]),
              ),
            }));
          }
          if (resolvedPaths.length) {
            appLifecycle.aiOptimizationApplied({ changes: resolvedPaths.length });
            onLog(t("aiLab.living.acceptedChangesLog", { count: resolvedPaths.length }));
            setPending((prev) => {
              const next = { ...prev };
              for (const path of resolvedPaths) delete next[path];
              return next;
            });
            setOrder((prev) => prev.filter((path) => !resolvedPaths.includes(path)));
          }
        })
        .catch((error) => onWarn((error as Error)?.message || "应用改动失败，请重试", "apply_failed"))
        .finally(() => setProcessing((prev) => prev.filter((path) => !order.includes(path))));
      return;
    }
    // Suggestions were actually taken into the résumé. This is the outcome that
    // says whether the AI was useful; a run that merely finished does not.
    appLifecycle.aiOptimizationApplied({ changes: changes.length });
    let nextSections = sectionsRef.current;
    let nextInfo = infoRef.current;
    let infoTouched = false;
    let failed = 0;
    for (const c of changes) {
      if (c.target.sectionKey === "info") {
        nextInfo = applyInfoChange(nextInfo, c);
        infoTouched = true;
      } else {
        const result = applyChangeToSections(nextSections, c);
        nextSections = result.sections;
        if (!result.applied) failed += 1;
      }
    }
    onApplySections(nextSections);
    if (infoTouched) onApplyInfo(nextInfo);
    // 报真正落地的条数。一次「全部接受」里混着写不进去的条目时，此前报的是总数——
    // 数字对不上简历，而用户没有任何办法知道差在哪。
    onLog(
      t("aiLab.living.acceptedChangesLog", { count: changes.length - failed }),
    );
    if (failed > 0) {
      onWarn(`有 ${failed} 处改动没能写进简历`, "apply_failed", {
        count: failed,
      });
    }
    setPending({});
    setOrder([]);
    setCursor(0);
    setPanelOpen(false);
  }, [order, batchRequest?.workspaceProposalId, onResolveWorkspace, onApplySections, onApplyInfo, onLog, onWarn, t]);

  const discardAll = useCallback(() => {
    const changes = order
      .map((path) => pendingRef.current[path])
      .filter(Boolean) as PendingChange[];
    const workspaceProposalId = batchRequest?.workspaceProposalId;
    const workspaceIds = changes
      .map((change) => change.workspaceChangeId)
      .filter((id): id is string => Boolean(id));
    if (workspaceProposalId && workspaceIds.length && onResolveWorkspace) {
      setProcessing((prev) => [...new Set([...prev, ...order])]);
      void onResolveWorkspace(workspaceProposalId, { reject: workspaceIds })
        .then(() => {
          setPending({});
          setOrder([]);
          setCursor(0);
          setPanelOpen(false);
        })
        .catch((error) => onWarn((error as Error)?.message || "拒绝改动失败，请重试", "apply_failed"))
        .finally(() => setProcessing((prev) => prev.filter((path) => !order.includes(path))));
      return;
    }
    setPending({});
    setOrder([]);
    setCursor(0);
    setPanelOpen(false);
  }, [order, batchRequest?.workspaceProposalId, onResolveWorkspace, onWarn]);

  const goTo = useCallback(
    (dir: 1 | -1) => {
      if (order.length === 0) return;
      const nextCursor = (cursor + dir + order.length) % order.length;
      setCursor(nextCursor);
      scrollToPath(order[nextCursor]);
    },
    [cursor, order, scrollToPath],
  );

  // Keyboard review shortcuts — only while reviewing and no overlay is open.
  useEffect(() => {
    if (order.length === 0 || popover || selection || sectionPopover) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        acceptAll();
      } else if (e.key === "Tab") {
        e.preventDefault();
        goTo(1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const path = order[Math.min(cursor, order.length - 1)];
        if (path) accept(path);
      } else if (e.key === "Escape") {
        e.preventDefault();
        const path = order[Math.min(cursor, order.length - 1)];
        if (path) discard(path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    order,
    cursor,
    popover,
    selection,
    sectionPopover,
    acceptAll,
    goTo,
    accept,
    discard,
  ]);

  // P3 · a whole-resume skill seeds a batch of in-place changes (replaces the old Diff tab).
  const lastBatchNonce = useRef<number>(0);
  useEffect(() => {
    if (!batchRequest) return;
    if (batchRequest.nonce === lastBatchNonce.current) return;
    const proposedSections = batchRequest.proposedSections;
    if (!proposedSections && !batchRequest.workspaceChanges) return;
    let revealTimer: number | undefined;
    let anchorTimer: number | undefined;
    let processingPaths: string[] = [];

    // 把整段副作用推迟到下一个 task：开发环境 Strict Mode 的第一轮 effect 会先 cleanup，
    // 因而不会留下 processing，也不会重复发送「无锚点」日志；第二轮才真正执行。此前用 ref
    // 提前把 nonce 标成已处理，第一轮计时器被 cleanup 取消后第二轮直接 return，扫光便永久
    // 停在 processing 状态，看起来像预览一直刷新。
    const prepareTimer = window.setTimeout(() => {
      if (batchRequest.nonce === lastBatchNonce.current) return;
      // 必须在 Strict Mode 探测结束后再提交 nonce；这样后续父组件重渲染不会重复处理同一批。
      lastBatchNonce.current = batchRequest.nonce;
      const diagnostics = { unmatchedItems: 0 };
      const changes = batchRequest.workspaceChanges ?? diffResumeToChanges(
        sectionsRef.current,
        proposedSections!,
        batchRequest.kind,
        batchRequest.lang,
        batchRequest.targetedSelection,
        diagnostics,
        batchRequest.changeNotes,
      );
      // 整条链路的终点。此前这里直接 return——画布不动、评审条不出现、一句提示都没有，
      // 而聊天里模型已经说「改好了」。这就是用户报的那个症状最后落地的地方。
      if (!changes.length) {
        onWarnRef.current(
          diagnostics.unmatchedItems > 0
            ? `有 ${diagnostics.unmatchedItems} 处改动对不上现有条目，已跳过`
            : "这次没有可评审的改动，画布保持原样",
          diagnostics.unmatchedItems > 0 ? "unmatched_items" : "no_changes",
          {
            count: diagnostics.unmatchedItems || undefined,
            detail: diagnostics,
          },
        );
        return;
      }
      const entries = changes.map((c) => ({
        path: pathOf(c.target),
        change: c,
      }));
      const paths = entries.map((e) => e.path);
      processingPaths = paths;
      setInteracted(true);
      setProcessing((prev) => [
        ...prev,
        ...paths.filter((p) => !prev.includes(p)),
      ]);
      // shimmer 一秒让改动「长出来」而不是「弹出来」。
      revealTimer = window.setTimeout(() => {
        setProcessing((prev) => prev.filter((p) => !paths.includes(p)));
        processingPaths = [];
        setPending((prev) => {
          const next = { ...prev };
          for (const { path, change } of entries) next[path] = change;
          return next;
        });
        setOrder((prev) => [
          ...prev,
          ...paths.filter((p) => !prev.includes(p)),
        ]);
        setCursor(0);

        // ResumePreview 会异步加载模板。等它真正渲染出任意 data-resume-path 后再做锚点
        // 对账；此前在骨架屏阶段检查，所有改动都会被误判为“不能在画布上显示”。
        let attempts = 0;
        const auditAnchors = () => {
          const root = scrollRef.current;
          const templateReady = Boolean(
            root?.querySelector("[data-resume-path]"),
          );
          if (!templateReady && attempts++ < 14) {
            anchorTimer = window.setTimeout(auditAnchors, 120);
            return;
          }
          const { orphaned } = partitionByAnchor(changes, (path) =>
            Boolean(root?.querySelector(`[data-resume-path="${path}"]`)),
          );
          if (orphaned.length === 0) return;
          onLogRef.current(
            `有 ${orphaned.length} 项改动所在字段暂不支持在纸面直接标注，请在右上角「${changes.length} 处改动」中查看并采纳`,
            undefined,
            "info",
          );
          appLifecycle.aiChangesDropped({
            reason: "no_anchor",
            count: orphaned.length,
          });
        };
        anchorTimer = window.setTimeout(auditAnchors, 60);
      }, 1000);
    }, 0);

    return () => {
      window.clearTimeout(prepareTimer);
      if (revealTimer !== undefined) window.clearTimeout(revealTimer);
      if (anchorTimer !== undefined) window.clearTimeout(anchorTimer);
      if (processingPaths.length > 0) {
        setProcessing((prev) =>
          prev.filter((path) => !processingPaths.includes(path)),
        );
      }
    };
  }, [batchRequest]);

  // 画布被关掉时，还没评审的提案会跟着组件一起消失（外层 AnimatePresence 是 mode="wait"，
  // 关闭即卸载）。把状态上提能保住它们，但那要动这个组件里最有状态的一块，风险不小；
  // 真正的伤害其实是「无声」——用户不知道自己刚才丢了什么。所以先让它出声。
  const pendingCountRef = useRef(0);
  pendingCountRef.current = Object.keys(pending).length;
  useEffect(
    () => () => {
      if (pendingCountRef.current > 0) {
        onWarn(
          `关闭画布时还有 ${pendingCountRef.current} 处改动没有评审，已丢弃`,
          "no_changes",
          { count: pendingCountRef.current },
        );
      }
    },
    [onWarn],
  );

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
      const el = scrollRef.current?.querySelector(
        `[data-resume-path="${path}"]`,
      );
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
      // Workspace proposals are checked against Platform's field hash at the
      // moment of resolve. Local renderer anchors cannot represent every
      // supported target (whole-item insert/remove, section order), so they
      // must not silently discard a valid server-owned change here.
      if (c.workspaceChangeId) return false;
      if (c.status === "accepted" || c.isInsert) return false;
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

  const pendingByPath = useMemo<Record<string, PendingChangeView>>(
    () => toPendingView(pending),
    [pending],
  );

  // 预览一份未落地的草稿时关掉就地编辑：把手、选区动作、评审卡都不该出现在
  // 一份用户还没接受的东西上。
  const editable = !previewResume;

  /**
   * 双击画布直接手改。
   *
   * ## 与 AI 提案是两条路，但写回是同一条
   *
   * AI 那条是「提案 → 评审卡 → 接受」，这条是「双击 → 打字 → 提交」，
   * 中间没有可评审的东西。但落到 store 的动作必须与 `accept` 完全一致——
   * 包括**同步更新 ref 而不只调 setter**（同一 tick 内连改两处，否则第二次会
   * 读到第一次之前的快照、把它吃掉），以及**写不进去就报错、绝不假装成功**。
   * 那两条都是这个文件里已经用事故换来的教训，手改没有理由重犯。
   *
   * 复用 `applyInfoChange` / `applyChangeToSections` 而不是自己写一遍赋值，
   * 也是同一个理由：写回规则只该有一份。
   */
  const commitManualEdit = useCallback(
    (target: EditableTarget, value: string) => {
      // 构造一条「已经定稿」的改动交给既有的写回函数。`before` 只用于日志。
      const change: PendingChange = {
        id: `manual-${pathOf(target)}`,
        target,
        before: "",
        after: value,
        rationale: "手动编辑",
        // `action` 是给「再来一版」记住原意图用的，而手改没有可重来的意图。
        // 用既有的 "free" 而不是造一个 "manual"——后者要动 ActionKind 联合类型，
        // 而这条改动从不进 pending 表，那个字段对它没有任何消费方。
        action: "free",
        seed: 0,
        // 手改一提交就是定稿，没有待评审阶段——这条改动从不进 pending 表。
        status: "accepted",
      };

      if (target.sectionKey === "info") {
        const nextInfo = applyInfoChange(infoRef.current, change);
        infoRef.current = nextInfo;
        onApplyInfo(nextInfo);
        return;
      }

      const { sections: nextSections, applied } = applyChangeToSections(
        sectionsRef.current,
        change,
      );
      if (!applied) {
        // 与 accept 同样的处理：让用户看见失败，而不是以为改上了。
        onWarn(`这处修改没能写进简历 · ${target.label}`, "apply_failed", {
          count: 1,
          detail: target,
        });
        return;
      }
      sectionsRef.current = nextSections;
      onApplySections(nextSections);
    },
    [onApplyInfo, onApplySections, onWarn],
  );

  const ctxValue = useMemo<EditableCanvasContextValue>(
    () => ({
      enabled: editable,
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
      // 预览态（版本历史、整份改写的对照预览）不给这个能力：
      // 那时画布上显示的不是当前简历，改它会写到错的地方。
      onCommit: editable ? commitManualEdit : undefined,
    }),
    [
      editable,
      commitManualEdit,
      pendingByPath,
      processing,
      errors,
      activePath,
      handleHandleClick,
      accept,
      discard,
      regenerate,
      retry,
      onSectionHandleClick,
    ],
  );

  const count = order.length;

  const changeRows = useMemo(
    () =>
      order
        .map((path) => {
          const c = pending[path];
          if (!c) return null;
          return {
            path,
            label: c.target.label,
            rationale: c.rationale,
            isInsert: c.isInsert,
          };
        })
        .filter(Boolean) as {
        path: string;
        label: string;
        rationale: string;
        isInsert?: boolean;
      }[],
    [order, pending],
  );

  const jumpTo = useCallback(
    (path: string) => {
      setPanelOpen(false);
      const idx = order.indexOf(path);
      if (idx >= 0) setCursor(idx);
      scrollToPath(path);
    },
    [order, scrollToPath],
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
            {t("aiLab.living.changeCountShort", { count })}
          </button>
        </div>
      )}

      <AnimatePresence>
        {panelOpen && (
          <ChangesPanel
            rows={changeRows}
            onJump={jumpTo}
            onAccept={accept}
            onDiscard={discard}
            onAcceptAll={acceptAll}
            onDiscardAll={discardAll}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        onMouseUp={onResumeMouseUp}
        className="scrollbar-hide relative flex-1 overflow-auto"
      >
        <div className="flex justify-center pt-6 pb-24 px-12">
          <div style={{ width: PAGE_WIDTH * SCALE }}>
            <div
              className="relative bg-[#fff] rounded-lg shadow-2xl"
              style={{
                width: PAGE_WIDTH,
                transform: `scale(${SCALE})`,
                transformOrigin: "top left",
                overflow: "visible",
              }}
            >
              <EditableCanvasProvider value={ctxValue}>
                <div style={{ padding: 4 }}>
                  <ResumePreview
                    info={shown.info}
                    sections={shown.sections}
                    sectionOrder={shown.sectionOrder.map((s) => s.key)}
                    templateId={templateId}
                  />
                </div>
              </EditableCanvasProvider>
              {/* 「纸面入定」——AI 工作中就在这张纸上压一层，而不是另开一块画布。
                  与主编辑器预览用的是同一个组件。 */}
              <AiThinkingOverlay isVisible={Boolean(working)} />
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
        <div
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 115,
            pointerEvents: "none",
          }}
        >
          {selection.rects.map((r, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: r.top,
                left: r.left,
                width: r.width,
                height: r.height,
                background: "rgba(56,189,248,0.28)",
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
            onAdd={() =>
              addItem(sectionPopover.sectionKey, sectionPopover.title)
            }
            onReorder={() =>
              reorder(sectionPopover.sectionKey, sectionPopover.title)
            }
            onClose={() => setSectionPopover(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Streaming chat updates belong to the left column. Keep the resume renderer and
// editable-canvas provider completely outside that render loop while their inputs
// are unchanged.
export default React.memo(LivingCanvas);
