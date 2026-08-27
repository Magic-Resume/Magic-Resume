import { NODE_TYPES } from './ast';
import type { TemplateDocument, TemplateNode } from './ast';
import { UNHANDLED_SECTIONS } from './compile';
import type { Diagnostic } from './ir';

/**
 * 模板校验。
 *
 * ## 它拦住什么，拦不住什么
 *
 * 拦得住：不认识的节点类型、缺必填字段、id 重复、嵌套过深、节点过多、没有 catch-all。
 *
 * **拦不住的是「结构合法但视觉崩了」**，而那恰恰是 AI 生成最常见的失败。业界实测：
 * 结构化输出保证 schema，不保证质量——某管线 schema 合法率 99.4%，但约 11% 的结果
 * 是错的，因为受约束解码屏蔽掉模型偏好的 token 后，它塌陷到了一个能满足语法的
 * 安全默认值。**加严 schema 有时反而制造问题。**
 *
 * 所以这一层是必要条件不是充分条件；真正的质量闸门是渲染后自检（下一期）。
 */

/** 与 JSON Schema 同一个来源，见 `ast.ts` 的 `NODE_TYPES`。 */
const KNOWN_TYPES = new Set<string>(NODE_TYPES);

/** 顶层属性名：不含 `.` 与 `[]`，且非空。 */
const isAssignableKey = (key: string): boolean =>
  key.length > 0 && !/[.[\]]/.test(key);

const MAX_DEPTH = 32;
const MAX_NODES = 5000;

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
}

interface Walk {
  diagnostics: Diagnostic[];
  ids: Set<string>;
  nodes: number;
  hasCatchAll: boolean;
  /** 有多少个绑定到简历数据的节点——用来判断「是不是把用户内容写死了」。 */
  boundNodes: number;
  literalContentNodes: number;
}

const isBinding = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'read' in value;

/** 字面量里带 `{{}}` 也算绑定——那是插值，不是写死。 */
const looksBound = (value: unknown): boolean =>
  isBinding(value) || (typeof value === 'string' && value.includes('{{'));

function walk(node: unknown, depth: number, w: Walk): void {
  if (depth > MAX_DEPTH) {
    w.diagnostics.push({ level: 'error', message: `嵌套超过 ${MAX_DEPTH} 层` });
    return;
  }
  if (typeof node !== 'object' || node === null) {
    w.diagnostics.push({ level: 'error', message: '节点必须是对象' });
    return;
  }

  const n = node as TemplateNode & Record<string, unknown>;
  w.nodes += 1;
  if (w.nodes > MAX_NODES) {
    w.diagnostics.push({ level: 'error', message: `节点总数超过 ${MAX_NODES}` });
    return;
  }

  if (!KNOWN_TYPES.has(n.type)) {
    // 未知类型本身不是致命的——有 fallback 就能降级。没有降级故事的「先小」
    // 才会逼出破坏性迁移，所以这里只在**没有 fallback 时**才报错。
    const level = n.fallback ? 'warn' : 'error';
    w.diagnostics.push({
      level,
      nodeId: typeof n.id === 'string' ? n.id : undefined,
      message: `未知节点类型 ${String(n.type)}${n.fallback ? '（有 fallback，可降级）' : ''}`,
    });
    if (level === 'error') return;
  }

  if (typeof n.id !== 'string' || !n.id) {
    w.diagnostics.push({ level: 'error', message: `${n.type} 缺少 id` });
  } else if (w.ids.has(n.id)) {
    // id 重复会让设计模式定位到错的节点，也会让 instanceId 撞车。
    w.diagnostics.push({ level: 'error', nodeId: n.id, message: `id 重复：${n.id}` });
  } else {
    w.ids.add(n.id);
  }

  if (n.each) {
    if (typeof n.each.path !== 'string' || !n.each.path) {
      w.diagnostics.push({ level: 'error', nodeId: n.id, message: 'each 缺少 path' });
    } else if (n.each.path === UNHANDLED_SECTIONS) {
      w.hasCatchAll = true;
    }
  }

  // `write` 必须是顶层可赋值属性名。写回做的是 `item[fieldKey] = …`，**不解析深路径**——
  // 给 `'meta.summary'` 会在条目上凭空造出一个名叫 `"meta.summary"` 的属性，
  // 用户改了字、界面上也变了，下次打开就没了。这类失败没有任何报错。
  for (const value of [n.value, n.href, n.src]) {
    const write = (value as { write?: unknown } | undefined)?.write;
    if (typeof write === 'string' && !isAssignableKey(write)) {
      w.diagnostics.push({
        level: 'error',
        nodeId: n.id,
        message: `write 必须是顶层属性名，不能是路径：「${write}」——写回不解析路径，编辑会静默丢失`,
      });
    }
  }

  // 内容节点：统计有没有绑定，用来发现「把用户内容写死进模板」
  if (n.type === 'Text' || n.type === 'RichText') {
    if (n.value === undefined) {
      w.diagnostics.push({ level: 'error', nodeId: n.id, message: `${n.type} 缺少 value` });
    } else if (looksBound(n.value)) {
      w.boundNodes += 1;
    } else if (typeof n.value === 'string' && n.value.trim().length > 12) {
      // 短字面量是标签（「工作经历」），长的多半是把简历正文抄进了模板。
      w.literalContentNodes += 1;
      w.diagnostics.push({
        level: 'warn',
        nodeId: n.id,
        message: `疑似把用户内容写死在模板里：「${String(n.value).slice(0, 20)}…」`,
      });
    }
  }
  if (n.type === 'Icon' && (n.name === undefined || !looksBound(n.name) && typeof n.name !== 'string')) {
    w.diagnostics.push({ level: 'error', nodeId: n.id, message: 'Icon 缺少 name' });
  }
  if (n.type === 'Image' && n.src === undefined) {
    w.diagnostics.push({ level: 'error', nodeId: n.id, message: 'Image 缺少 src' });
  }
  if (n.type === 'List' && !Array.isArray(n.items)) {
    w.diagnostics.push({ level: 'error', nodeId: n.id, message: 'List 的 items 必须是数组' });
  }

  if (n.type === 'Box') {
    for (const child of (n.children ?? []) as TemplateNode[]) walk(child, depth + 1, w);
    if (n.separator) walk(n.separator, depth + 1, w);
  }
  if (n.fallback && n.fallback !== 'drop') walk(n.fallback, depth + 1, w);
}

/**
 * 校验一棵模板树。
 *
 * `ok` 为 false 表示**不该渲染**；`warn` 级的诊断不阻断渲染，但设计模式该显示出来。
 */
export function validateTemplate(doc: unknown): ValidationResult {
  const w: Walk = {
    diagnostics: [],
    ids: new Set(),
    nodes: 0,
    hasCatchAll: false,
    boundNodes: 0,
    literalContentNodes: 0,
  };

  if (typeof doc !== 'object' || doc === null) {
    return { ok: false, diagnostics: [{ level: 'error', message: '模板必须是对象' }] };
  }
  const d = doc as TemplateDocument;
  if (d.version !== 1) {
    w.diagnostics.push({ level: 'error', message: `不支持的模板版本：${String(d.version)}` });
  }
  if (!d.root) {
    return { ok: false, diagnostics: [...w.diagnostics, { level: 'error', message: '缺少 root' }] };
  }

  walk(d.root, 0, w);

  /*
   * catch-all 缺失是 **warn 而不是 error**，但它是最该盯住的一条：
   * 模板不声明自定义分区时，渲染器本来会自动合成；一棵硬编码绑定的树没有 catch-all，
   * 就会让用户自建的「获奖经历」**静默消失**——不报错，只是内容没了，比崩了更糟。
   */
  if (!w.hasCatchAll) {
    w.diagnostics.push({
      level: 'warn',
      message: `模板没有 catch-all（each.path = "${UNHANDLED_SECTIONS}"），用户自建分区将不会显示`,
    });
  }

  if (w.boundNodes === 0 && w.nodes > 3) {
    w.diagnostics.push({
      level: 'error',
      message: '模板没有任何数据绑定——它渲染的是模板自己的文字，不是用户的简历',
    });
  }

  return { ok: !w.diagnostics.some((x) => x.level === 'error'), diagnostics: w.diagnostics };
}
