/**
 * `when` 的条件语言。
 *
 * ## 为什么是结构化 DSL 而不是表达式字符串
 *
 * 模板会由 AI 生成、会存进数据库、会被分享。表达式字符串意味着要么写一个求值器，
 * 要么 `eval`——而后者等于**把 JSON 重新变成一个代码执行容器**，那正是我们选择
 * 「模板是数据不是代码」时要避开的东西。
 *
 * 结构化的代价是啰嗦一点，换来的是：可校验、可迁移、跨语言实现一致、
 * 以及**没有任何一条路径能执行用户/模型提供的代码**。
 */

/** 迭代上下文。`isFirst`/`isLast` 只有在 `each` 里才有意义。 */
export interface ConditionContext {
  index?: number;
  count?: number;
  /** 读一个路径的当前值。 */
  read: (path: string) => unknown;
}

export type Condition =
  /** 路径有值（非 null/undefined/空串/空数组）。最常用的一条。 */
  | { exists: string }
  | { equals: [string, string | number | boolean] }
  | { not: Condition }
  | { and: Condition[] }
  | { or: Condition[] }
  /**
   * 当前是不是迭代里的第一/最后一项。
   *
   * 不是凑数的：时间线的竖线必须在**最后一项之外**才画，否则末尾会多出一截；
   * 项间分隔符也靠它。没有这两个，这两种常见形态就得靠额外节点硬凑。
   */
  | { isFirst: true }
  | { isLast: true };

/** 一个值算不算「有」。空数组算没有——分区没条目时整块该消失，而不是留个空标题。 */
export const isPresent = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

/**
 * 求值。**永不抛异常**——条件写错只该让那一块不显示，不该让整个渲染崩掉。
 * 无法识别的条件按 `false` 处理（保守：宁可少显示，不要显示一块坏的）。
 */
export function evaluateCondition(
  condition: Condition | undefined,
  ctx: ConditionContext,
): boolean {
  if (!condition) return true;
  try {
    if ('exists' in condition) return isPresent(ctx.read(condition.exists));
    if ('equals' in condition) {
      const [path, expected] = condition.equals;
      return ctx.read(path) === expected;
    }
    if ('not' in condition) return !evaluateCondition(condition.not, ctx);
    if ('and' in condition) {
      return condition.and.every((c) => evaluateCondition(c, ctx));
    }
    if ('or' in condition) {
      return condition.or.some((c) => evaluateCondition(c, ctx));
    }
    if ('isFirst' in condition) return ctx.index === 0;
    if ('isLast' in condition) {
      return ctx.index !== undefined && ctx.index === (ctx.count ?? 0) - 1;
    }
  } catch {
    // 落到下面的 false。
  }
  return false;
}
