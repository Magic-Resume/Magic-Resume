import type { TemplateDocument, TemplateNode } from './ast';
import type { StyleRef } from './style';
import { sanitizeStyle } from './style';

/**
 * 设计模式：直接改模板树。
 *
 * 画布上每个元素都带 `data-template-node`（第 1 期埋的 `templateNodeId`），
 * 点中它就拿到了要改哪个节点。这个文件提供的是**对树的补丁操作**——
 * 纯函数、不可变、可撤销，UI 只负责把点击翻译成一次调用。
 *
 * ## 为什么改的是「树」而不是「渲染出来的东西」
 *
 * 设计模式改的必须是**作者格式**，不是 IR。IR 是 `each` 展开后的结果：
 * 用户点中第 2 条经历的公司名，改的却应该是那个模板节点——于是三条经历一起变。
 * 若改 IR，就只有第 2 条变了，而且下次重新编译就没了。
 *
 * 这也是 `instanceId` 与 `templateNodeId` **两个 id 都要**的原因：
 * 就地编辑（改内容）用前者定位到具体那一条，设计模式（改样式）用后者定位到模板节点。
 *
 * ## 不可变的理由不是风格
 *
 * 撤销/重做要靠「留住上一棵树」。原地改的话，撤销栈里全是同一个对象的引用，
 * 撤回去会发现什么都没变——而且这个 bug 只在用户点了撤销时才暴露。
 */

/** 深度优先，含 `separator` 与 `fallback`。 */
const mapNode = (
  node: TemplateNode,
  fn: (n: TemplateNode) => TemplateNode,
): TemplateNode => {
  const mapped = fn(node);
  const next: TemplateNode = { ...mapped };

  if (next.type === 'Box' && mapped.type === 'Box') {
    if (mapped.children) next.children = mapped.children.map((c) => mapNode(c, fn));
    if (mapped.separator) next.separator = mapNode(mapped.separator, fn);
  }
  if (mapped.fallback && typeof mapped.fallback === 'object') {
    next.fallback = mapNode(mapped.fallback, fn);
  }
  return next;
};

/** 找一个节点。找不到返回 undefined——**不抛**，UI 里选中态随时可能指向已删除的节点。 */
export function findNode(doc: TemplateDocument, nodeId: string): TemplateNode | undefined {
  let found: TemplateNode | undefined;
  mapNode(doc.root, (n) => {
    if (n.id === nodeId) found = n;
    return n;
  });
  return found;
}

/**
 * 改一个节点的样式。**合并而不是替换**：面板上调字号不该把颜色一起清掉。
 *
 * 覆盖写在 `style` 数组**最后一位**，这样它压过前面所有引用与内联——
 * 「我明明调了却不生效」是这类面板最常见的投诉，而成因几乎总是覆盖顺序。
 *
 * 传 `null` 表示删掉某个属性（回到继承值），这是「重置」按钮要用的。
 */
export function setNodeStyle(
  doc: TemplateDocument,
  nodeId: string,
  patch: Record<string, unknown>,
): TemplateDocument {
  // 白名单与钳制在这里就过一遍：面板是人在操作，越早给出「这个值不行」越好，
  // 而不是等到渲染时被静默丢掉、用户以为自己没点中。
  const clean = sanitizeStyle(
    Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)),
  ) as Record<string, unknown>;
  const removals = Object.entries(patch)
    .filter(([, v]) => v === null)
    .map(([k]) => k);

  return {
    ...doc,
    root: mapNode(doc.root, (n) => {
      if (n.id !== nodeId) return n;

      const style = [...(n.style ?? [])];
      const last = style[style.length - 1];
      // 末位已经是内联对象就就地合并，否则追加一个——否则每调一次都堆一层，
      // 调二十次字号就得到二十个对象。
      const base = typeof last === 'object' && last !== null ? { ...last } : {};
      for (const key of removals) delete base[key];
      const merged = { ...base, ...clean };

      if (typeof last === 'object' && last !== null) style.pop();
      if (Object.keys(merged).length) style.push(merged as StyleRef);

      return { ...n, ...(style.length ? { style } : {}) } as TemplateNode;
    }),
  };
}

/** 改一个节点的字面量文案（分区标题这类）。绑定节点不受影响——那是内容不是模板。 */
export function setNodeText(
  doc: TemplateDocument,
  nodeId: string,
  text: string,
): TemplateDocument {
  return {
    ...doc,
    root: mapNode(doc.root, (n) => {
      if (n.id !== nodeId) return n;
      if (n.type !== 'Text' && n.type !== 'RichText') return n;
      // 只改字面量。节点绑着数据时，改的是用户简历内容，那条路走就地编辑，不走这里。
      if (typeof n.value !== 'string') return n;
      return { ...n, value: text };
    }),
  };
}

/**
 * 显示 / 隐藏一个节点。
 *
 * 用 `when: { not: ... }` 这种取巧写法会把条件语义搞脏，所以直接给一个
 * 恒假条件——`hidden` 这个保留路径在任何简历上都取不到值。
 * 这样「隐藏」在树里是可读的，也能被原样撤销。
 */
const HIDDEN_PATH = '$hidden';

export function setNodeHidden(
  doc: TemplateDocument,
  nodeId: string,
  hidden: boolean,
): TemplateDocument {
  return {
    ...doc,
    root: mapNode(doc.root, (n) => {
      if (n.id !== nodeId) return n;
      if (!hidden) {
        // 只清掉我们自己加的那个条件，用户/模型写的 `when` 不能动。
        if (n.when && 'exists' in n.when && n.when.exists === HIDDEN_PATH) {
          const { when: _when, ...rest } = n;
          return rest as TemplateNode;
        }
        return n;
      }
      return { ...n, when: { exists: HIDDEN_PATH } };
    }),
  };
}

export const isNodeHidden = (node: TemplateNode | undefined): boolean =>
  Boolean(node?.when && 'exists' in node.when && node.when.exists === HIDDEN_PATH);

/**
 * 挪动一个节点在兄弟里的位置。
 *
 * 只在同一个父节点内挪——跨父拖拽听起来更强，但会把「这个节点属于哪个分区」
 * 变成可以被拖坏的东西（编辑锚点、`section` 声明都挂在祖先链上）。
 * 同级重排覆盖了绝大多数真实需求：调整字段先后、把日期从右边挪到左边。
 */
export function moveNode(
  doc: TemplateDocument,
  nodeId: string,
  delta: number,
): TemplateDocument {
  return {
    ...doc,
    root: mapNode(doc.root, (n) => {
      if (n.type !== 'Box' || !n.children) return n;
      const index = n.children.findIndex((c) => c.id === nodeId);
      if (index < 0) return n;
      const target = Math.max(0, Math.min(n.children.length - 1, index + delta));
      if (target === index) return n;
      const children = [...n.children];
      const [moved] = children.splice(index, 1);
      children.splice(target, 0, moved);
      return { ...n, children };
    }),
  };
}

/** 删一个节点。根节点删不掉——删了就没有树了。 */
export function removeNode(doc: TemplateDocument, nodeId: string): TemplateDocument {
  if (doc.root.id === nodeId) return doc;
  return {
    ...doc,
    root: mapNode(doc.root, (n) => {
      if (n.type !== 'Box' || !n.children) return n;
      const children = n.children.filter((c) => c.id !== nodeId);
      return children.length === n.children.length ? n : { ...n, children };
    }),
  };
}

/**
 * 节点大纲，给设计面板的树形导航用。
 *
 * `label` 是给人看的：优先用字面量文案，其次用绑定路径，都没有就用类型名。
 * 一列 `Text` `Text` `Text` 的大纲等于没有大纲。
 */
export interface OutlineEntry {
  id: string;
  type: TemplateNode['type'];
  depth: number;
  label: string;
  hidden: boolean;
  /** 这个节点是不是某个分区的外壳——大纲里应当更醒目。 */
  sectionKey?: string;
}

const labelOf = (node: TemplateNode): string => {
  if ('value' in node) {
    if (typeof node.value === 'string' && node.value.trim()) return node.value.trim().slice(0, 24);
    if (node.value && typeof node.value === 'object') {
      const read = node.value.read;
      return Array.isArray(read) ? read[0] : read;
    }
  }
  if (node.type === 'Icon') {
    if (typeof node.name === 'string') return node.name;
    return Array.isArray(node.name.read) ? node.name.read[0] : node.name.read;
  }
  if (node.type === 'Box' && node.each) return `${node.each.path} ×`;
  return node.type;
};

export function outlineOf(doc: TemplateDocument): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const walk = (node: TemplateNode, depth: number): void => {
    out.push({
      id: node.id,
      type: node.type,
      depth,
      label: labelOf(node),
      hidden: isNodeHidden(node),
      ...(node.type === 'Box' && node.section ? { sectionKey: node.section.sectionKey } : {}),
    });
    if (node.type === 'Box') {
      for (const child of node.children ?? []) walk(child, depth + 1);
      if (node.separator) walk(node.separator, depth + 1);
    }
  };
  walk(doc.root, 0);
  return out;
}
