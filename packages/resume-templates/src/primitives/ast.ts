/**
 * Template AST —— **作者格式**。
 *
 * 模板作者（人或 AI）写的就是这棵树。它与**渲染格式**（`ir.ts` 的 Resolved IR）刻意分开：
 * 这里有 `each` / `when` / binding / 样式引用这些**需要解释**的东西，而渲染器一个都不该懂。
 *
 * ## 三条贯穿始终的设计约束
 *
 * 1. **迭代与条件是属性，不是节点。** 调研的 16 个可序列化系统（MJML / Puck / Builder.io /
 *    Adaptive Cards / Notion / Figma / Typst / OOXML / ODF …）没有一个把它们做成节点类型。
 *    原因很实际：`Box(direction:row) → Repeat → [3 项]` 给父节点的是**一个** flex 子元素，
 *    不是三个。做成属性，一个节点就说清了「重复谁、什么时候出现、长什么样」。
 *
 * 2. **产物必须可序列化。** 模板若是代码，AI 生成的模板就是**执行不可信代码**。
 *    是 JSON 就能校验、能存库、能分享、能做 diff。这是我们与「模板即 React 组件」
 *    路线的根本分歧。
 *
 * 3. **词汇表只收两个渲染后端都能实现的东西。** 一边做不到的一律不进——这条纪律是
 *    PDF 保真的唯一保障。所以没有 CSS grid（react-pdf 没有），没有 box-shadow。
 */

import type { Condition } from './condition';
import type { StyleRef } from './style';

/**
 * 节点类型的**运行时**清单。类型、校验器、JSON Schema 三者都从这里派生。
 *
 * 原本这份清单在仓库里有三份手写副本（这个 union、`validate.ts` 的 Set，
 * 再加上要给 AI 用的 schema）。TS 的联合类型在运行期不存在，所以副本之间
 * 漏同步不会报错——只会让新节点被静默拒绝或静默放行。
 *
 * **加一个之前先问：两个后端都能实现吗？**
 */
export const NODE_TYPES = ['Box', 'Text', 'RichText', 'List', 'Image', 'Icon'] as const;

export type NodeType = (typeof NODE_TYPES)[number];

/**
 * 从简历里读一个值。
 *
 * **读与写显式分开。** binding 不只是「把值显示出来」，还要说清「用户改完写回哪里」——
 * 而这两者经常不是同一个键：fieldMap 里的 `description` 只是显示别名，真正能写回的
 * 可能是 `summary`。写错就是「改了但页面没变」，且没有任何报错。
 */
export interface Binding {
  /**
   * 取值路径，或候选链。候选链按顺序取第一个有值的。
   *
   * 顺序是承重的：`['summary','description']` 里 `summary` 在前，因为那是编辑器真正
   * 写入的字段；`description` 垫后只为让旧导入的数据还能显示。
   */
  read: string | string[];
  /**
   * 可写键。省略时从 `read` 命中的那个候选推断。
   *
   * ⚠️ 必须是**顶层可赋值属性名**。写回做的是 `item[fieldKey] = …`，不解析深路径；
   * 给 `'meta.summary'` 会凭空造出一个名为 `"meta.summary"` 的属性，编辑静默丢失。
   */
  write?: string;
  /** 取不到时显示什么。不给就整个节点不渲染。 */
  fallback?: string;
}

/** 字面量或绑定。字符串里的 `{{path}}` 会被插值。 */
export type Value = string | Binding;

/**
 * 迭代。
 *
 * `path` 指向一个数组；子树里的相对路径落在当前项上。特殊值 `$unhandledSections`
 * 展开成「模板没有显式声明的那些分区」——即 catch-all，见 §catch-all。
 */
export interface EachSpec {
  path: string;
  /** 当前项在子树里叫什么，缺省 `item`。索引恒为 `index`。 */
  as?: string;
}

/** 间距档位。**枚举而不是数字**——模型从封闭枚举里选不出丑的间距。 */
export type SpacingToken = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface NodeBase {
  /**
   * 模板内稳定且唯一。设计模式靠它定位「模板里的哪个节点」，
   * 而 `each` 展开后的每个实例另有 `instanceId`——两个 id 缺一不可。
   */
  id: string;
  each?: EachSpec;
  /** 条件为假则整块不渲染。没有它，可选字段会在版面上留下空洞。 */
  when?: Condition;
  /** 样式引用与内联覆盖的混合数组，如 `["sectionHeading", { marginTop: 4 }]`。 */
  style?: StyleRef[];
  /** 可点。**统一走 `safeHref`**，不可信的 URL 会被降级成纯文本。 */
  href?: Value;
  /** 间距档位，编译期换算成具体数值。 */
  spacing?: SpacingToken;
  /** 分页时尽量不要从这里断开。仅在 `paged` 模式下有语义。 */
  keepTogether?: boolean;
  /**
   * 未知节点类型或校验失败时的降级。
   *
   * `'drop'` = 整块丢掉且**不向上冒泡**。这是 Adaptive Cards 的做法：
   * 有降级故事，「先小后大」才是安全的；没有降级的「先小」会逼出破坏性迁移。
   */
  fallback?: 'drop' | TemplateNode;
}

/** flex 容器。**没有 grid**——react-pdf 不支持，词汇表以两端交集为准。 */
export interface BoxNode extends NodeBase {
  type: 'Box';
  children?: TemplateNode[];
  /**
   * 插在重复项**之间**的节点（不是每项后面）。
   *
   * 「A · B · C」这种形态用「每项后加一个」会多出末尾那个。参考简历的联系方式行
   * 正是这个形态。
   */
  separator?: TemplateNode;
  /**
   * 声明「这个 Box 是某个分区的外壳」，于是它获得手柄与插入槽。
   *
   * `sectionKey` / `title` 都过 `{{}}` 插值，catch-all 里可以写 `{{item.key}}`——
   * 用户自建分区因此也能有手柄，而不是只有内建分区才有。
   */
  section?: { sectionKey: string; title?: string; handle?: boolean; insertSlot?: boolean };
}

/** 一段文字。 */
export interface TextNode extends NodeBase {
  type: 'Text';
  value: Value;
  /**
   * 语义角色。**不是为了好看**：它让 HTML 输出能给出真正的标题标签（可访问性）、
   * 让 PDF 能生成大纲书签，也让「所有小节标题大一号」变成改一处而不是改十二处。
   */
  role?: 'title' | 'sectionHeading' | 'body' | 'caption';
}

/** 富文本正文（经历描述那一段 HTML）。 */
export interface RichTextNode extends NodeBase {
  type: 'RichText';
  value: Value;
}

/**
 * 列表。**扁平式**——每项自带 `level`，没有需要配对开合的包裹节点。
 *
 * 调研里最经得起考验的三个格式全是扁平的（OOXML 的 `w:ilvl`、Google Docs 的
 * `nestingLevel`、Notion）。理由很实际：**模型漏一个标签不会让整棵树坏掉**，
 * 层级写错只是外观问题。
 *
 * 而且 react-pdf 根本没有列表原语，简历又约 80% 是要点——不给它，模型每次都会
 * 手搓 `Box(row) → Text("•") + Text(...)`，而且每次搓得不一样。
 */
export interface ListNode extends NodeBase {
  type: 'List';
  ordered?: boolean;
  items: ListItem[];
}

export interface ListItem {
  value: Value;
  /** 缩进层级，0 起。符号随层级变化：实心点 → 空心圆 → 方块。 */
  level?: number;
}

export interface ImageNode extends NodeBase {
  type: 'Image';
  src: Value;
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain';
}

/** 图标。与 `Image` 分开：一个从名字注册表解析，一个从 URL——失败路径完全不同。 */
export interface IconNode extends NodeBase {
  type: 'Icon';
  /**
   * 图标名也可以从当前迭代项读取。例如自定义分区的 `sectionOrder.icon`：
   * `{ read: 'icon' }`。编译后仍然收敛成一个受注册表约束的字符串。
   */
  name: Value;
  size?: number;
}

export type TemplateNode =
  | BoxNode
  | TextNode
  | RichTextNode
  | ListNode
  | ImageNode
  | IconNode;

// 双向钉死：`TemplateNode` 里的每个 `type` 都在清单里，反之亦然。
// 加了新节点接口却忘了加进清单（或反过来），这两行就是编译错误。
const _nodeTypesCoverUnion: TemplateNode['type'] extends NodeType ? true : never = true;
const _unionCoversNodeTypes: NodeType extends TemplateNode['type'] ? true : never = true;
void _nodeTypesCoverUnion;
void _unionCoversNodeTypes;

/**
 * 一棵模板树。
 *
 * `version` **只在根上一个，不要每节点一个**。Lexical 明确后悔过每节点版本号：
 * 它不与子类组合，基类升版会让子类无处记录自己的版本。
 */
export interface TemplateDocument {
  version: 1;
  /** 样式字典。节点用名字引用，避免同样 8 个属性在 30 个节点上重复。 */
  styles?: Record<string, Record<string, unknown>>;
  /** 分页设置。**省略即单页**——与既有 19 个模板行为一致。 */
  page?: PageSpec;
  root: TemplateNode;
}

/**
 * 分页。**默认 `single`，这是一个产品决定不是技术妥协。**
 *
 * 既有的 `MagicResumePdfDocument` 是单个 `<Page>` 随内容长高、不分页，理由是产品面向
 * 线上投递与分享链接，连续阅读优于分页，不会有经历被拦腰截断；代价是打印会被缩放。
 * 那个决定不该被这一层顺手推翻，所以默认值保持 `single`。
 *
 * `paged` 只在模板**显式声明**时生效，届时 `keepTogether` 才有语义——
 * 在 `single` 下它是彻底惰性的（没有页边界可言）。
 */
/** 运行时清单，JSON Schema 从这里读——手写第二份必然会拼错大小写。 */
export const PAGE_SIZES = ['A4', 'Letter'] as const;
export const PAGE_MODES = ['single', 'paged'] as const;

export interface PageSpec {
  mode?: (typeof PAGE_MODES)[number];
  size?: (typeof PAGE_SIZES)[number];
  /** 页边距（CSS px）。`paged` 下有意义；`single` 下由模板自己的 padding 决定。 */
  margin?: number;
}
