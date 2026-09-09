import { nanoid } from "nanoid";
import type { EditableTarget } from "./editableCanvas";
import type { Section } from "@/types/frontend/resume";
import {
  buildSelectionPreview,
  fieldTitle,
  parsePath,
  sectionTitle,
  stripHtml,
  type PendingChange,
} from "./changeModel";

/** A whole-resume content skill that produces a batch of reviewable changes. */
export type BatchKind = "optimize" | "translate";

export type TargetedSelectionDiff = {
  path: string;
  selectionText: string;
};

/**
 * 不参与 diff 的字段——**黑名单，不是白名单**。
 *
 * 此前这里是一份三项的白名单（summary / description / name），于是 agent 改了 company /
 * position / date / school / degree / level / url 里的任何一个，画布上都**永远不会出现**：
 * 用户看到的是「说改了、什么都没变」，而实际上改动确实产出了，只是 diff 认不出来。
 *
 * 改成黑名单是因为 `SectionItem` 是开放索引签名，且产品支持自定义区块（`customSectionKey`）
 * ——白名单必然漏，而漏掉的表现恰恰是静默。
 */
const NON_DIFFABLE_FIELDS = new Set([
  "id",
  "visible",
  "icon",
  "customSectionKey",
]);

/** 富文本还是纯文本：按值里有没有 HTML 标签判，而不是按字段名猜。 */
const kindOf = (value: string): EditableTarget["kind"] =>
  /<[a-z][\s\S]*>/i.test(value) ? "html" : "text";

/** 这个条目上所有能参与 diff 的字符串字段名。 */
function diffableKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(
    (k) =>
      !NON_DIFFABLE_FIELDS.has(k) &&
      (typeof a[k] === "string" || typeof b[k] === "string"),
  );
}

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
  diagnostics?: DiffDiagnostics,
  /** 模型给的逐字段理由，键为 `section/itemId/fieldKey`。配不上的字段宁可没有理由。 */
  changeNotes?: Map<string, string>,
): PendingChange[] {
  if (targetedSelection) {
    const targeted = diffTargetedSelection(
      current,
      proposed,
      kind,
      lang,
      targetedSelection,
    );
    if (targeted) return [targeted];
  }

  const out: PendingChange[] = [];
  // 翻译只有一个理由，说出来是准确的；改写没有——每条改动的理由只有模型知道，
  // 它经 `explain_changes` 送过来（`changeNotes`）。拿不到就**留空**：
  // 「AI 按目标岗位优化」对每条改动都成立，因此对每条改动都没有信息量，
  // 用户没法据此判断哪条值得接受，而一句听起来像理由的话会让他以为判断过了。
  const fallbackRationale =
    kind === "translate" ? `翻译为 ${lang || "English"}` : "";
  for (const sectionKey of Object.keys(proposed)) {
    const proposedItems = proposed[sectionKey];
    const currentItems = current[sectionKey];
    if (!Array.isArray(proposedItems) || !Array.isArray(currentItems)) continue;
    let indexInSection = 0;
    for (const pItem of proposedItems) {
      if (pItem.visible === false) continue;
      indexInSection += 1;
      // Skills preserve item ids, so match by id; only diff items present in both.
      const cItem = currentItems.find(
        (it) => String(it.id) === String(pItem.id),
      );
      if (!cItem) {
        // 按 id 配对，配不上就整条跳过。agent 是从云端读的简历，只要它重建了 id、
        // 丢了 id 或整体替换了数组，每一条改动都会在这里无声消失。
        if (diagnostics) diagnostics.unmatchedItems += 1;
        continue;
      }
      for (const fieldKey of diffableKeys(cItem, pItem)) {
        const before =
          typeof cItem[fieldKey] === "string"
            ? (cItem[fieldKey] as string)
            : "";
        const after =
          typeof pItem[fieldKey] === "string"
            ? (pItem[fieldKey] as string)
            : "";
        // Compare text content (ignore pure HTML-formatting churn); skip empties / no-ops.
        if (!after.trim() || stripHtml(before) === stripHtml(after)) continue;
        const target: EditableTarget = {
          sectionKey,
          itemId: String(pItem.id),
          fieldKey,
          kind: kindOf(after),
          label: `${sectionTitle(sectionKey)} · 第 ${indexInSection} 条 · ${fieldTitle(fieldKey)}`,
        };
        out.push({
          id: nanoid(),
          target,
          before,
          after,
          rationale:
            changeNotes?.get(`${sectionKey}/${String(pItem.id)}/${fieldKey}`) ??
            fallbackRationale,
          action: kind === "translate" ? "translate" : "rewrite",
          lang,
          seed: 0,
          status: "pending",
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
  targetedSelection: TargetedSelectionDiff,
): PendingChange | null {
  const parsed = parsePath(targetedSelection.path);
  if (!parsed || parsed.sectionKey === "info") return null;

  const currentItems = current[parsed.sectionKey];
  const proposedItems = proposed[parsed.sectionKey];
  if (!Array.isArray(currentItems) || !Array.isArray(proposedItems))
    return null;

  const currentItem = currentItems.find(
    (it) => String(it.id) === parsed.itemId,
  );
  const proposedItem = proposedItems.find(
    (it) => String(it.id) === parsed.itemId,
  );
  if (!currentItem || !proposedItem) return null;

  const before =
    typeof currentItem[parsed.fieldKey] === "string"
      ? (currentItem[parsed.fieldKey] as string)
      : "";
  const after =
    typeof proposedItem[parsed.fieldKey] === "string"
      ? (proposedItem[parsed.fieldKey] as string)
      : "";
  if (!after.trim() || stripHtml(before) === stripHtml(after)) return null;

  const visibleIndex = proposedItems
    .filter((item) => item.visible !== false)
    .findIndex((item) => String(item.id) === parsed.itemId);

  const target: EditableTarget = {
    ...parsed,
    // 按值判富文本还是纯文本，与整篇 diff 同一套规则。此前查的是那份三项白名单，
    // 白名单外的字段一律当 'html' —— 一处纯文本改动会被当富文本渲染。
    kind: kindOf(after),
    label: `${sectionTitle(parsed.sectionKey)} · 第 ${visibleIndex >= 0 ? visibleIndex + 1 : 1} 条 · ${fieldTitle(parsed.fieldKey)}`,
  };

  return {
    id: nanoid(),
    target,
    before,
    after,
    ...buildSelectionPreview(before, after, targetedSelection.selectionText),
    rationale:
      kind === "translate" ? `翻译为 ${lang || "English"}` : "AI 优化选中片段",
    action: kind === "translate" ? "translate" : "rewrite",
    selectionText: targetedSelection.selectionText,
    lang,
    seed: 0,
    status: "pending",
  };
}
