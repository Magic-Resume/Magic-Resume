import type { StyleRef } from './style';
import type { TemplateDocument, TemplateNode } from './ast';

/**
 * 样式归一化：把重复的内联样式提进字典、节点改成引用。
 *
 * ## 为什么要有这一步
 *
 * 先例是 ODF 的 `office:automatic-styles`——允许作者直接套格式，然后**机器生成**
 * 具名样式并改写引用。抄它是因为它同时满足三件本来打架的事：
 *
 * - **模型好写**：让它随便内联，不用先想好一套样式名再往回引用。这不是体贴，
 *   是准确率问题——先建字典再引用要求全局一致性，而生成模型最不擅长这个。
 * - **存储紧凑**：反面教材有实证。**Builder.io 把 `responsiveStyles` 内联在每个块上，
 *   结果内容条目撞到 ~1MB 上限保存失败**，官方文档专门写了一节教人「把重复抽进 Symbol」。
 * - **diff 稳定**：改一处颜色只动字典里的一行，而不是散落在 30 个节点上的 30 处。
 *
 * 关键在于它是**确定性后处理**，不用调提示词、不用求模型配合。
 *
 * ## 三条不变量（都有测试钉住）
 *
 * 1. **不改变渲染结果**：`compile(doc)` 与 `compile(normalize(doc))` 产出的 IR 逐字相同。
 *    归一化是存储层的事，一旦它能改变画面，就没人敢在保存路径上跑它了。
 * 2. **幂等**：`normalize(normalize(x))` 等于 `normalize(x)`。否则每次保存都产生 diff。
 * 3. **确定性**：同样的输入永远得到同样的名字。名字按稳定的深度优先顺序分配，
 *    不用哈希做名字——哈希名 diff 里读不出任何东西，而且改一个属性会让名字整个变掉。
 */

/** 出现几次才值得提进字典。1 次提进去只是多一层间接，字节数还变多了。 */
const HOIST_THRESHOLD = 2;

/** 稳定序列化：键排序，这样 `{a,b}` 与 `{b,a}` 认得出是同一个。 */
const stableKey = (style: Record<string, unknown>): string =>
  JSON.stringify(
    Object.keys(style)
      .sort()
      .map((k) => [k, style[k]]),
  );

/** 深度优先遍历所有节点，含 `separator` 与 `fallback` 这两个容易漏掉的分支。 */
function* walk(node: TemplateNode): Generator<TemplateNode> {
  yield node;
  if (node.type === 'Box') {
    for (const child of node.children ?? []) yield* walk(child);
    if (node.separator) yield* walk(node.separator);
  }
  // `fallback` 里也有样式。漏掉它的话，降级路径上的样式永远不参与归一化——
  // 平时看不出来，正好在出问题时体积最大。
  if (node.fallback && typeof node.fallback === 'object') yield* walk(node.fallback);
}

export interface NormalizeResult {
  document: TemplateDocument;
  /** 提取了几条、省了多少个内联对象。调用方可以决定要不要写回。 */
  hoisted: number;
  inlinedBefore: number;
}

export function normalizeStyles(doc: TemplateDocument): NormalizeResult {
  const dictionary: Record<string, Record<string, unknown>> = { ...(doc.styles ?? {}) };

  // 字典里已有的条目也参与去重：内联对象若与某条已有样式相同，直接引用它，
  // 不必新建一条一模一样的。
  const nameByKey = new Map<string, string>();
  for (const [name, style] of Object.entries(dictionary)) {
    const key = stableKey(style);
    if (!nameByKey.has(key)) nameByKey.set(key, name);
  }

  // 第一遍：数每个内联样式出现多少次（按首次出现顺序记录，名字才稳定）。
  const counts = new Map<string, number>();
  const order: string[] = [];
  const inlineByKey = new Map<string, Record<string, unknown>>();
  let inlinedBefore = 0;

  for (const node of walk(doc.root)) {
    for (const ref of node.style ?? []) {
      if (typeof ref === 'string') continue;
      inlinedBefore++;
      const key = stableKey(ref);
      if (!counts.has(key)) {
        counts.set(key, 0);
        order.push(key);
        inlineByKey.set(key, ref);
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  // 分配名字。`s1` `s2` … 按首次出现顺序，跳过已被占用的名字。
  let seq = 0;
  const nextName = (): string => {
    let name: string;
    do {
      seq++;
      name = `s${seq}`;
    } while (name in dictionary);
    return name;
  };

  let hoisted = 0;
  for (const key of order) {
    if (nameByKey.has(key)) continue; // 与字典里已有的相同，直接复用
    if ((counts.get(key) ?? 0) < HOIST_THRESHOLD) continue;
    const name = nextName();
    dictionary[name] = inlineByKey.get(key) as Record<string, unknown>;
    nameByKey.set(key, name);
    hoisted++;
  }

  // 第二遍：改写引用。**合并顺序原封不动**——`["base", {覆盖}]` 里内联的那个在后面，
  // 换成名字之后仍然在后面，否则覆盖关系会反过来。
  const rewrite = (node: TemplateNode): TemplateNode => {
    const next: TemplateNode = { ...node };

    if (node.style?.length) {
      next.style = node.style.map<StyleRef>((ref) => {
        if (typeof ref === 'string') return ref;
        return nameByKey.get(stableKey(ref)) ?? ref;
      });
    }
    if (next.type === 'Box') {
      if (node.type === 'Box' && node.children) next.children = node.children.map(rewrite);
      if (node.type === 'Box' && node.separator) next.separator = rewrite(node.separator);
    }
    if (node.fallback && typeof node.fallback === 'object') {
      next.fallback = rewrite(node.fallback);
    }
    return next;
  };

  const root = rewrite(doc.root);
  return {
    document: {
      ...doc,
      ...(Object.keys(dictionary).length ? { styles: dictionary } : {}),
      root,
    },
    hoisted,
    inlinedBefore,
  };
}
