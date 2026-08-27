import type { ResolvedStyle } from './style';

/**
 * Resolved Layout IR —— **渲染格式**。
 *
 * 与 `ast.ts` 的作者格式刻意分开。到了这里，`each` 已经展开、`when` 已经求过值、
 * binding 已经变成字面文本、样式已经合并钳制、URL 已经过安全闸门。
 *
 * ## 唯一的规则：渲染器不解释业务
 *
 * DOM 与 PDF 两个后端**只接受 IR**。它们不读简历数据、不执行 `each` / `when`、
 * 不自己猜字段、不自己 sanitize URL。
 *
 * 这不是洁癖，是这次重构的核心目的：双后端漂移**从架构上消除**，而不是靠人手同步
 * 两份实现。此前 `summary` / `awards` 在导出时静默消失，正是因为两个渲染器各存了
 * 一份「哪些分区是内建的」，然后漂了。语义只有一份，就没有第二份可漂。
 */

/** 编辑锚点。有它这块才可编辑；没有就是只读——**而且不会有任何告警**。 */
export interface EditAnchor {
  sectionKey: string;
  /** 条目 id。**按 id 不按下标**——渲染会过滤隐藏条目，下标不稳定。 */
  itemId?: string;
  /**
   * 可写键。写回做的是 `item[fieldKey] = …`，**不解析深路径**。
   * 给一个 `'a.b'` 会凭空造出名为 `"a.b"` 的属性，编辑静默丢失。
   */
  fieldKey: string;
  kind: 'text' | 'richText';
  /**
   * 给人看的定位，如「工作经历 · 第 2 条」。评审卡与撤销提示都显示它。
   *
   * 由编译器合成而非模板作者填写：只有编译器同时知道分区名和**展开后的序号**，
   * 让作者写等于让他去猜一个运行期才存在的数。
   */
  label: string;
}

/**
 * 区块级元数据：悬停手柄（改标题 / 删分区）、末尾的「加一条」插槽，以及自定义分区
 * 选中的标题图标。
 *
 * 与 `EditAnchor` 分开：那个锚的是**一个字段**，这个锚的是**一整块**。
 * 现有 6 个区块组件里 5 个有这两样，`CompactList` 没有——于是
 * `skills-first` / `slate-sidebar` 两个模板里 AI 提不了「加一项技能」。
 * 放进 IR 就是为了让「有没有」变成模板显式声明的一件事，而不是某个组件忘了写。
 */
export interface SectionEditor {
  sectionKey: string;
  title: string;
  /** 来自 `sectionOrder.icon`；仅在注册表中存在时进入 IR。 */
  icon?: string;
  handle?: boolean;
  insertSlot?: boolean;
}

export interface ResolvedNodeBase {
  /**
   * `each` 展开后这一个实例的唯一 id。与 `templateNodeId` **两个都要**：
   * 前者定位「运行时的哪一份」，后者定位「模板里的哪个节点」。
   * 设计模式要靠后者，就地编辑要靠前者，两者共用同一块画布。
   */
  instanceId: string;
  templateNodeId: string;
  style: ResolvedStyle;
  /** 已过 `safeHref`。不可信的 URL 在编译期就变成了 undefined。 */
  href?: string;
  keepTogether?: boolean;
}

export interface ResolvedBox extends ResolvedNodeBase {
  type: 'Box';
  children: ResolvedNode[];
  /** 有它才有区块编辑能力；其中的 `icon` 同时由 DOM/PDF 后端绘制。 */
  editor?: SectionEditor;
}

export interface ResolvedText extends ResolvedNodeBase {
  type: 'Text';
  text: string;
  role?: 'title' | 'sectionHeading' | 'body' | 'caption';
  edit?: EditAnchor;
}

export interface ResolvedRichText extends ResolvedNodeBase {
  type: 'RichText';
  /** 原始 HTML。**两个后端各自 sanitize**——它们的白名单本来就不同。 */
  html: string;
  edit?: EditAnchor;
}

export interface ResolvedList extends ResolvedNodeBase {
  type: 'List';
  ordered: boolean;
  items: Array<{ text: string; level: number }>;
}

export interface ResolvedImage extends ResolvedNodeBase {
  type: 'Image';
  src: string;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
}

export interface ResolvedIcon extends ResolvedNodeBase {
  type: 'Icon';
  name: string;
  size?: number;
}

export type ResolvedNode =
  | ResolvedBox
  | ResolvedText
  | ResolvedRichText
  | ResolvedList
  | ResolvedImage
  | ResolvedIcon;

/** 编译产物。`diagnostics` 记下被丢弃的东西——静默丢弃比报错更难查。 */
export interface CompileResult {
  root: ResolvedNode | null;
  /** 解析后的分页设置，缺省值已填好。渲染器不再需要处理「没写」这种情况。 */
  page: ResolvedPage;
  diagnostics: Diagnostic[];
}

export interface ResolvedPage {
  mode: 'single' | 'paged';
  size: 'A4' | 'Letter';
  /** 点数（已从 CSS px 换算）。 */
  marginPoints: number;
}

export interface Diagnostic {
  level: 'warn' | 'error';
  /** 出问题的模板节点 id，便于设计模式直接高亮。 */
  nodeId?: string;
  message: string;
}
