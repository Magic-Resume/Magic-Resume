import type { TemplateDocument } from './ast';
import { compile } from './compile';
import type { ResolvedNode } from './ir';
import { validateTemplate } from './validate';

/**
 * 新旧两条路径的接缝。**两个渲染器共用这一个入口。**
 *
 * `ComponentDefinition.tree` 有值就走这里，否则走 legacy 组件注册表。
 * 之所以要共用而不是各写各的：这一层要判断的东西（校验、诊断、失败怎么办）
 * 若两边各写一份，就又造出了一对会漂的孪生实现——而消除孪生正是整件事的目的。
 *
 * ## 失败一律降级成「什么都不画」，不抛
 *
 * 一个坏掉的分区不该让整份简历白屏，也不该让导出抛未捕获异常。诊断信息只在
 * 开发期打出来：线上把它打给用户没有意义，用户改不了模板。
 */

const isDev = process.env.NODE_ENV !== 'production';

export function compileTreeComponent(
  tree: unknown,
  resume: Record<string, unknown>,
  componentId: string,
): ResolvedNode | undefined {
  const check = validateTemplate(tree);
  if (!check.ok) {
    if (isDev) {
      console.warn(
        `[resume-templates] 组件 "${componentId}" 的模板树未通过校验，已跳过：\n` +
          check.diagnostics.map((d) => `  · ${d.message}`).join('\n'),
      );
    }
    return undefined;
  }

  const { root, diagnostics } = compile(tree as TemplateDocument, resume);
  if (isDev) {
    for (const d of diagnostics) {
      // warn 里最值得看的是「条目缺 id → 这个字段不可编辑」——
      // 那是唯一一类**在界面上完全看不出来**的退化。
      console.warn(`[resume-templates] ${componentId}: ${d.message}`);
    }
  }
  return root ?? undefined;
}
