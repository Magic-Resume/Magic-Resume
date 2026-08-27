import type { ResolvedStyle } from './style';

/**
 * `role` 带来的样式。**两个后端共用这一份。**
 *
 * 不能靠「DOM 用 `<h2>` 的浏览器默认字重，PDF 显式写 700」——那是两套来源，
 * 必然漂移，而且模板本来就会重置浏览器默认样式。一致性测试第一次跑就抓到了这条。
 *
 * 语义标签仍然照出（`<h2>` 之于可访问性、之于 PDF 大纲），但**视觉由这里决定**。
 */
export const ROLE_STYLE: Record<string, ResolvedStyle> = {
  title: { fontWeight: 700 },
  sectionHeading: { fontWeight: 700 },
  body: {},
  caption: {},
};

/** role 的样式垫在节点自身样式**之下**——模板显式写的永远赢。 */
export const withRoleStyle = (
  role: string | undefined,
  style: ResolvedStyle,
): ResolvedStyle => (role ? { ...ROLE_STYLE[role], ...style } : style);
