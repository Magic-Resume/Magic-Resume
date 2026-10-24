import type { PendingChange } from './changeModel';
import { pathOf, type PendingChangeView } from './editableCanvas';

/**
 * 把待评审改动投影成模板渲染器要的视图。
 *
 * 抽成纯函数是因为它漏过字段：`previewBefore` / `previewAfter` / `previewKind` 三个曾经
 * 没被带过去，而 `PendingChangeCard` 正是读它们来渲染选区级 diff（`pending.previewBefore
 * ?? pending.before`）。结果是「选中一句话让 AI 改」这个功能事实上失效——画布上整段都变成
 * 红删绿增，而 `buildSelectionChange` / `diffTargetedSelection` 辛苦算出的精确范围全丢了。
 *
 * 内联在组件里时这种遗漏无法被测试；抽出来之后有一条断言钉着它。
 */
export function toPendingView(
  pending: Record<string, PendingChange>
): Record<string, PendingChangeView> {
  const out: Record<string, PendingChangeView> = {};
  for (const [path, c] of Object.entries(pending)) {
    out[path] = {
      before: c.before,
      after: c.after,
      // 选区级 diff 的精确范围。缺了它们，卡片只能拿整字段的 before/after 兜底。
      previewBefore: c.previewBefore,
      previewAfter: c.previewAfter,
      previewKind: c.previewKind,
      rationale: c.rationale,
      rationaleDetail: c.rationaleDetail,
      status: c.status,
      isInsert: c.isInsert,
    };
  }
  return out;
}

/**
 * 这些改动里，哪些在当前模板上**没有落点**。
 *
 * 模板各自决定渲染哪些字段（`getFieldEntry` 在候选别名里取第一个有值的 key），所以一处
 * 合法的改动完全可能在当前模板上没有对应的 `data-resume-path` 节点。此前它照样进 `order`：
 * 评审条说「有 N 处改动」，画布上一处都看不见，`scrollToPath` 里 `if (!el) return` 静静地
 * 什么都不做——一个用户永远点不到、也不知道为什么点不到的幽灵计数。
 *
 * 与模板配置解耦：将来新增模板漏配候选表，是响亮的而不是静默的。
 */
export function partitionByAnchor(
  changes: PendingChange[],
  hasAnchor: (path: string) => boolean
): { renderable: PendingChange[]; orphaned: PendingChange[] } {
  const renderable: PendingChange[] = [];
  const orphaned: PendingChange[] = [];
  for (const change of changes) {
    // 新增条目还没有 DOM 节点是正常的——`SectionInsertSlot` 会接住它们。
    if (change.isInsert || hasAnchor(pathOf(change.target))) renderable.push(change);
    else orphaned.push(change);
  }
  return { renderable, orphaned };
}
