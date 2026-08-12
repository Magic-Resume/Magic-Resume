import { nanoid } from 'nanoid';
import type { EditableTarget } from './editableCanvas';
import type { Section } from '@/types/frontend/resume';

/**
 * living canvas 的改动模型：可评审的就地修订形状、动作词汇、目标定位，以及接受后的写入。
 * 这一半与后端无关——换 edit provider 不影响评审/应用路径的形状。
 */

// Quick actions (element-scoped)

export type QuickActionId =
  | 'quantify'
  | 'concise'
  | 'verb'
  | 'evidence'
  | 'rewrite'
  | 'tone'
  | 'shorten';

export interface QuickAction {
  id: QuickActionId;
  label: string;
}

/** Quick actions for an experience / project bullet. */
export const BULLET_ACTIONS: QuickAction[] = [
  { id: 'quantify', label: '量化' },
  { id: 'concise', label: '精简' },
  { id: 'verb', label: '换个动词' },
  { id: 'evidence', label: '补证据' },
];

/** Quick actions for a summary-style block. */
export const SUMMARY_ACTIONS: QuickAction[] = [
  { id: 'rewrite', label: '重写' },
  { id: 'tone', label: '调整语气' },
  { id: 'shorten', label: '缩短' },
];

export function actionsForTarget(target: EditableTarget): QuickAction[] {
  // The header summary is a free-text blurb — only the summary-style actions apply.
  if (target.sectionKey === 'info') return SUMMARY_ACTIONS;
  if (target.sectionKey === 'experience' || target.sectionKey === 'projects') {
    return BULLET_ACTIONS;
  }
  return [...BULLET_ACTIONS, ...SUMMARY_ACTIONS];
}

// 这里原本还有一张 `FREE_ROUTES` 关键词表（量化/精简/缩短…）和 `routeFreeText`，
// 把用户的自由输入猜成一个固定动作。全仓没有任何调用点——但它和 `handleSend` 里那六条
// 路由是同一类东西：在前端用关键词替模型决定用户想干什么。一并删掉，免得下次有人接上去。

// Selection-driven actions

export type SelectionActionId = 'polish' | 'shorten' | 'translate';

export interface SelectionAction {
  id: SelectionActionId;
  label: string;
}

export const SELECTION_ACTIONS: SelectionAction[] = [
  { id: 'polish', label: '优化这段' },
  { id: 'shorten', label: '缩短' },
  { id: 'translate', label: '翻译' },
];

export type ActionKind = QuickActionId | SelectionActionId | 'free';

// The reviewable change unit

export interface PendingChange {
  id: string;
  target: EditableTarget;
  /** 接受改动时写入的完整字段值；富文本字段可能是含多条 bullet 的整段经历描述。 */
  before: string;
  after: string;
  /** Optional review-only values for selection edits, so the diff card can stay scoped. */
  previewBefore?: string;
  previewAfter?: string;
  previewKind?: EditableTarget['kind'];
  rationale: string;
  /** longer "why", revealed on demand */
  rationaleDetail?: string;
  /** what produced this change — kept so "再来一版" can regenerate the same intent */
  action: ActionKind;
  freeText?: string;
  /** set for selection-scoped changes: the exact substring the action rewrote */
  selectionText?: string;
  /** target language for translate actions */
  lang?: string;
  /** true for "add a new item" proposals (rendered green-only, appended on accept) */
  isInsert?: boolean;
  /** bumped on each regenerate to cycle the mock variants */
  seed: number;
  status: 'pending' | 'accepted';
}

// Target locating

/** Resume section key → display title, for change labels. */
const SECTION_TITLES: Record<string, string> = {
  experience: '工作经历',
  education: '教育经历',
  projects: '项目经历',
  skills: '专业技能',
  languages: '语言能力',
  certificates: '证书资质',
  profiles: '个人主页',
  awards: '奖项',
};

export function sectionTitle(sectionKey: string): string {
  return SECTION_TITLES[sectionKey] || sectionKey;
}

/** Inverse of the renderer's `pathOf` — recover a target from a DOM anchor. */
export function parsePath(
  path: string
): { sectionKey: string; itemId: string; fieldKey: string } | null {
  const info = /^info\.(.+)$/.exec(path);
  if (info) return { sectionKey: 'info', itemId: '', fieldKey: info[1] };
  const m = /^sections\.([^.[]+)\[(.+)\]\.([^.]+)$/.exec(path);
  if (!m) return null;
  return { sectionKey: m[1], itemId: m[2], fieldKey: m[3] };
}

// Shared text helpers (used by apply here + the mock/service generators)

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type SelectionPreview = {
  previewBefore: string;
  previewAfter: string;
  previewKind: 'text';
};

function extractSelectedReplacement(beforeText: string, afterText: string, selectedText: string): string {
  const idx = beforeText.indexOf(selectedText);
  if (idx >= 0) {
    const prefix = beforeText.slice(0, idx);
    const suffix = beforeText.slice(idx + selectedText.length);
    if (afterText.startsWith(prefix) && afterText.endsWith(suffix)) {
      return afterText.slice(prefix.length, afterText.length - suffix.length).trim();
    }
  }

  let start = 0;
  while (
    start < beforeText.length &&
    start < afterText.length &&
    beforeText[start] === afterText[start]
  ) {
    start += 1;
  }

  let endBefore = beforeText.length;
  let endAfter = afterText.length;
  while (
    endBefore > start &&
    endAfter > start &&
    beforeText[endBefore - 1] === afterText[endAfter - 1]
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }

  return afterText.slice(start, endAfter).trim();
}

export function buildSelectionPreview(
  fullBefore: string,
  fullAfter: string,
  selectionText: string
): SelectionPreview | undefined {
  const selected = stripHtml(selectionText);
  if (!selected) return undefined;

  const beforeText = stripHtml(fullBefore);
  const afterText = stripHtml(fullAfter);
  const replacement = extractSelectedReplacement(beforeText, afterText, selected);

  return {
    previewBefore: selected,
    previewAfter: replacement || afterText || selected,
    previewKind: 'text',
  };
}

/** Re-wrap improved text in the same outer structure the field used. */
export function wrapLike(originalHtml: string, text: string): string {
  if (/<li[\s>]/i.test(originalHtml)) return `<ul><li>${text}</li></ul>`;
  return `<p>${text}</p>`;
}

/** Strip the HTML wrapper for plain-text targets (e.g. the header summary). */
export function finalizeAfter(kind: EditableTarget['kind'], after: string): string {
  return kind === 'text' ? stripHtml(after) : after;
}

// provider 只回 `{ after, rationale }`，下面几个 helper 把它组装成 PendingChange。

/** What the edit service hands back (kept local so this module needs no backend import). */
export interface EditResultLike {
  after: string;
  rationale: string;
  rationaleDetail?: string;
}

/** Element quick action (ActionPopover) → reviewable change. */
export function buildElementChange(
  target: EditableTarget,
  before: string,
  action: QuickActionId | 'free',
  result: EditResultLike,
  freeText?: string
): PendingChange {
  return {
    id: nanoid(),
    target,
    before,
    after: finalizeAfter(target.kind, result.after),
    rationale: result.rationale,
    rationaleDetail: result.rationaleDetail,
    action,
    freeText,
    seed: 0,
    status: 'pending',
  };
}

/** Selection-scoped edit → reviewable change (keeps `selectionText` for regenerate). */
export function buildSelectionChange(
  target: EditableTarget,
  fullHtml: string,
  selectionText: string,
  action: SelectionActionId | 'free',
  result: EditResultLike,
  opts?: { freeText?: string; lang?: string }
): PendingChange {
  const after = finalizeAfter(target.kind, result.after);
  const preview = buildSelectionPreview(fullHtml, after, selectionText);
  return {
    id: nanoid(),
    target,
    before: fullHtml,
    after,
    ...preview,
    rationale: result.rationale,
    rationaleDetail: result.rationaleDetail,
    action,
    freeText: opts?.freeText,
    selectionText,
    lang: opts?.lang,
    seed: 0,
    status: 'pending',
  };
}

/**
 * 这些 section 靠 itemName 渲染而非 summary。'name' 在所有模板的 itemName 候选里都是
 * 兜底项，写它跨模板都能显示；写 'summary' 则插入的内容根本看不见。
 */
const NAME_FIELD_SECTIONS = new Set(['skills', 'languages', 'certificates', 'awards', 'profiles']);

/** A fresh target for an insert — made by the caller so its path is stable across the async call. */
export function makeInsertTarget(sectionKey: string, title: string): EditableTarget {
  const isNameField = NAME_FIELD_SECTIONS.has(sectionKey);
  return {
    sectionKey,
    itemId: `new-${nanoid(6)}`,
    fieldKey: isNameField ? 'name' : 'summary',
    kind: isNameField ? 'text' : 'html',
    label: `${title} · 新增一条`,
  };
}

/** New-item proposal (green-only insert) → reviewable change. */
export function buildInsertChange(target: EditableTarget, result: EditResultLike): PendingChange {
  return {
    id: nanoid(),
    target,
    before: '',
    after: result.after,
    rationale: result.rationale,
    rationaleDetail: result.rationaleDetail,
    action: 'free',
    isInsert: true,
    seed: 0,
    status: 'pending',
  };
}

// Apply an accepted change onto the resume (patch-style, by item id)

/**
 * Apply an accepted change onto the resume sections (clone + write by item id).
 *
 * `applied` 是这个返回值存在的理由。此前失败时它原样返回 `sections`，而调用方无条件把卡片
 * 标成已接受、写一行「已改写」、420ms 后移除——用户看到的是成功，store 里一个字都没变。
 * 那是「我明明点了接受，怎么还是老样子」的直接来源。
 */
export function applyChangeToSections(
  sections: Section,
  change: PendingChange
): { sections: Section; applied: boolean } {
  // info 走 applyInfoChange，不是失败。
  if (change.target.sectionKey === 'info') return { sections, applied: false };
  const next: Section = JSON.parse(JSON.stringify(sections));
  const items = next[change.target.sectionKey];
  if (!Array.isArray(items)) return { sections, applied: false };
  const item = items.find((it) => String(it.id) === change.target.itemId);
  if (item) {
    item[change.target.fieldKey] = change.after;
    return { sections: next, applied: true };
  }
  if (change.isInsert) {
    items.push({ id: change.target.itemId, visible: true, [change.target.fieldKey]: change.after });
    return { sections: next, applied: true };
  }
  return { sections, applied: false };
}

/** Apply an accepted change onto resume.info (returns a new InfoType-shaped object). */
export function applyInfoChange<T extends Record<string, unknown>>(info: T, change: PendingChange): T {
  if (change.target.sectionKey !== 'info') return info;
  return { ...info, [change.target.fieldKey]: change.after };
}

/** Reorder a section's items so the strongest (quantified / longer) read first. */
export function reorderSection(sections: Section, sectionKey: string): Section {
  const items = sections[sectionKey];
  if (!Array.isArray(items) || items.length < 2) return sections;
  const score = (it: Record<string, unknown>) => {
    const text = ['summary', 'description']
      .map((k) => (typeof it[k] === 'string' ? (it[k] as string) : ''))
      .join(' ');
    const quantified = /\d|%|％/.test(text) ? 1000 : 0;
    return quantified + stripHtml(text).length;
  };
  const next: Section = JSON.parse(JSON.stringify(sections));
  next[sectionKey] = [...next[sectionKey]].sort((a, b) => score(b) - score(a));
  return next;
}
