import { nanoid } from 'nanoid';
import type { EditableTarget } from './editableCanvas';
import type { Section } from '@/types/frontend/resume';
import {
  buildSelectionPreview,
  parsePath,
  sectionTitle,
  stripHtml,
  type PendingChange,
} from './changeModel';

/** A whole-resume content skill that produces a batch of reviewable changes. */
export type BatchKind = 'optimize' | 'translate';

export type TargetedSelectionDiff = {
  path: string;
  selectionText: string;
};

// Item fields surfaced as reviewable in-place changes, with the render kind the
// living canvas uses. `summary`/`description` are rich-text bodies (html) of
// experience/education/projects. `name` is the item TITLE — for skills /
// languages / certificates that's the only visible, translatable text (ListSection
// renders it via `fieldMap.itemName`), and it's plain text, so it diffs as `text`.
// Without `name`, a translation rewrites every skill but the canvas diffs none.
// Non-string / empty fields are skipped by the empty-`after` guard below, so this
// is safe across all sections (experience/education `name` is null → skipped).
const DIFF_FIELDS: ReadonlyArray<{ key: string; kind: EditableTarget['kind'] }> = [
  { key: 'summary', kind: 'html' },
  { key: 'description', kind: 'html' },
  { key: 'name', kind: 'text' },
];

/**
 * Real resume diff → reviewable in-place changes for the living canvas. This is
 * the mock→service swap `changeModel` was designed for: instead of inventing fake
 * before/after text (`createBatchChanges`), compare the agent's proposed resume
 * (carried by a `resume_update` SSE event) against the current one — field by
 * field, matched by item `id` — and emit one `PendingChange` per meaningfully
 * changed rich-text field. The change model + apply path in `./changeModel` are
 * untouched, so the living-canvas review (accept/discard/inline diff) works as-is.
 */
/**
 * 为什么这次 diff 什么都没产出。
 *
 * 空结果此前是终点沉默：画布不动、评审条不出现、一句提示都没有，而聊天里模型已经说
 * 「改好了」。要把它变成一句人话，得先知道是「一条都对不上」还是「确实没变化」。
 */
export interface DiffDiagnostics {
  /** proposed 里有、但按 id 在 current 里找不到的条目数（agent 重新生成了 id 就会这样）。 */
  unmatchedItems: number;
}

export function diffResumeToChanges(
  current: Section,
  proposed: Section,
  kind: BatchKind,
  lang?: string,
  targetedSelection?: TargetedSelectionDiff,
  diagnostics?: DiffDiagnostics
): PendingChange[] {
  if (targetedSelection) {
    const targeted = diffTargetedSelection(current, proposed, kind, lang, targetedSelection);
    if (targeted) return [targeted];
  }

  const out: PendingChange[] = [];
  const rationale = kind === 'translate' ? `翻译为 ${lang || 'English'}` : 'AI 按目标岗位优化';
  for (const sectionKey of Object.keys(proposed)) {
    const proposedItems = proposed[sectionKey];
    const currentItems = current[sectionKey];
    if (!Array.isArray(proposedItems) || !Array.isArray(currentItems)) continue;
    let indexInSection = 0;
    for (const pItem of proposedItems) {
      if (pItem.visible === false) continue;
      indexInSection += 1;
      // Skills preserve item ids, so match by id; only diff items present in both.
      const cItem = currentItems.find((it) => String(it.id) === String(pItem.id));
      if (!cItem) {
        // 按 id 配对，配不上就整条跳过。agent 是从云端读的简历，只要它重建了 id、
        // 丢了 id 或整体替换了数组，每一条改动都会在这里无声消失。
        if (diagnostics) diagnostics.unmatchedItems += 1;
        continue;
      }
      for (const { key: fieldKey, kind: fieldKind } of DIFF_FIELDS) {
        const before = typeof cItem[fieldKey] === 'string' ? (cItem[fieldKey] as string) : '';
        const after = typeof pItem[fieldKey] === 'string' ? (pItem[fieldKey] as string) : '';
        // Compare text content (ignore pure HTML-formatting churn); skip empties / no-ops.
        if (!after.trim() || stripHtml(before) === stripHtml(after)) continue;
        const target: EditableTarget = {
          sectionKey,
          itemId: String(pItem.id),
          fieldKey,
          kind: fieldKind,
          label: `${sectionTitle(sectionKey)} · 第 ${indexInSection} 条`,
        };
        out.push({
          id: nanoid(),
          target,
          before,
          after,
          rationale,
          action: kind === 'translate' ? 'translate' : 'rewrite',
          lang,
          seed: 0,
          status: 'pending',
        });
      }
    }
  }
  return out;
}

function diffTargetedSelection(
  current: Section,
  proposed: Section,
  kind: BatchKind,
  lang: string | undefined,
  targetedSelection: TargetedSelectionDiff
): PendingChange | null {
  const parsed = parsePath(targetedSelection.path);
  if (!parsed || parsed.sectionKey === 'info') return null;

  const currentItems = current[parsed.sectionKey];
  const proposedItems = proposed[parsed.sectionKey];
  if (!Array.isArray(currentItems) || !Array.isArray(proposedItems)) return null;

  const currentItem = currentItems.find((it) => String(it.id) === parsed.itemId);
  const proposedItem = proposedItems.find((it) => String(it.id) === parsed.itemId);
  if (!currentItem || !proposedItem) return null;

  const fieldMeta = DIFF_FIELDS.find((f) => f.key === parsed.fieldKey);
  const before = typeof currentItem[parsed.fieldKey] === 'string' ? (currentItem[parsed.fieldKey] as string) : '';
  const after = typeof proposedItem[parsed.fieldKey] === 'string' ? (proposedItem[parsed.fieldKey] as string) : '';
  if (!after.trim() || stripHtml(before) === stripHtml(after)) return null;

  const visibleIndex = proposedItems
    .filter((item) => item.visible !== false)
    .findIndex((item) => String(item.id) === parsed.itemId);

  const target: EditableTarget = {
    ...parsed,
    kind: fieldMeta?.kind ?? 'html',
    label: `${sectionTitle(parsed.sectionKey)} · 第 ${visibleIndex >= 0 ? visibleIndex + 1 : 1} 条`,
  };

  return {
    id: nanoid(),
    target,
    before,
    after,
    ...buildSelectionPreview(before, after, targetedSelection.selectionText),
    rationale: kind === 'translate' ? `翻译为 ${lang || 'English'}` : 'AI 优化选中片段',
    action: kind === 'translate' ? 'translate' : 'rewrite',
    selectionText: targetedSelection.selectionText,
    lang,
    seed: 0,
    status: 'pending',
  };
}
