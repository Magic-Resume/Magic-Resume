/**
 * 列表符号与缩进。**两个后端共用这一份。**
 *
 * 符号随层级变化（实心点 → 空心圆 → 方块），与 CSS 的 `disc / circle / square`
 * 同一套语义。之所以要显式共享而不是各自用原生列表：
 *
 * - react-pdf 没有列表原语，PDF 侧本来就要自己画
 * - 只改一边就是制造新的漂移，而消除漂移正是这层架构的目的
 *
 * 简历里约 80% 的内容是要点，层级信息是「做了什么 / 怎么做的 / 结果如何」的骨架——
 * 三级都是同一个圆点，等于把骨架抹平。
 */

/** 逐级符号。超出长度的按最后一个算。 */
export const LIST_MARKERS = ['•', '◦', '▪', '·'] as const;

/** 每级缩进多少（em）。用 em 而不是 px：跟着字号走，小字号模板不会缩得过头。 */
const INDENT_PER_LEVEL_EM = 1.1;

export const listIndent = (level: number): string =>
  `${Math.max(0, level) * INDENT_PER_LEVEL_EM}em`;

/** PDF 侧要的是点数，不是 em——按当前字号换算。 */
export const listIndentPoints = (level: number, fontSize: number): number =>
  Math.max(0, level) * INDENT_PER_LEVEL_EM * fontSize;

export const markerFor = (level: number, ordered: boolean, index: number): string =>
  ordered ? `${index + 1}.` : LIST_MARKERS[Math.min(Math.max(0, level), LIST_MARKERS.length - 1)];
