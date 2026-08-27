import get from 'lodash.get';
import { getFieldEntry, safeHref } from '../fieldAccess';
import { isBuiltInSection } from '../sectionSemantics';
import type {
  Binding,
  BoxNode,
  ListItem,
  TemplateDocument,
  TemplateNode,
  Value,
} from './ast';
import { evaluateCondition, isPresent, type Condition } from './condition';
import type {
  CompileResult,
  Diagnostic,
  EditAnchor,
  ResolvedNode,
  ResolvedPage,
  SectionEditor,
} from './ir';
import { zhTitleForSection } from '../sectionSemantics';
import { hasIcon } from './icons';
import { PX_TO_PT, SPACING_SCALE, resolveStyle } from './style';

/**
 * Template Compiler —— **唯一理解模板语义的模块**。
 *
 * `compile(template, resume) → Resolved IR`。这里做完 `each` 展开、`when` 求值、
 * binding 解析、样式合并、URL 安全化、编辑锚点推导，之后两个渲染器只负责画。
 *
 * ## 三条不变量
 *
 * 1. **永不抛异常。** 一棵坏模板只该产出诊断信息和一棵能画的（可能不完整的）树，
 *    不该让用户的编辑器白屏。
 * 2. **渲染器不解释业务。** 凡是需要「读简历」「判断条件」「猜字段」的，都在这里做完。
 * 3. **安全在这里收口。** URL 安全化不是一个独立阶段——那意味着有人可以绕过它。
 *    它内嵌在取值路径上：拿到 href 的唯一途径就是走过闸门。
 */

/** 防栈溢出与病态输入。模型偶尔会生成自嵌套的结构。 */
const MAX_DEPTH = 32;
const MAX_NODES = 5000;
/** 单次 `each` 最多展开多少项。真实简历没有几百条经历，超出的多半是绑错了路径。 */
const MAX_EACH = 200;

// 模板原语刚上线时，Template Lab 的示例使用过一组并不属于产品 Resume 的
// 顶部字段名。用户已经把那批树存进自己的简历，不能只修最新资产就让旧卡片一直
// 显示空白。这里是**只读兼容层**：新模板一律使用真实字段，旧模板仍可渲染。
const LEGACY_INFO_PATH_ALIASES: Record<string, string> = {
  'info.phone': 'info.phoneNumber',
  'info.title': 'info.headline',
  'info.location': 'info.address',
  'info.github': 'info.website',
};

// 原先的 tech-dense 资产没有给可选联系方式行写 `when`，于是空值时会留下图标。
// 这三个稳定 id 是那一版资产的迁移标识；新资产本身已经内建同样的条件。
const LEGACY_CONTACT_ROW_CONDITIONS: Record<string, Condition> = {
  'c-phone': {
    or: [{ exists: 'info.phoneNumber' }, { exists: 'info.phone' }, { exists: 'info.email' }],
  },
  'c-who': {
    or: [
      { exists: 'info.headline' },
      { exists: 'info.title' },
      { exists: 'info.address' },
      { exists: 'info.location' },
    ],
  },
  'c-link': {
    or: [{ exists: 'info.website' }, { exists: 'info.github' }],
  },
};

// 这份节点只服务于已经存下来的 tech-dense 模板。它们的表头在 `c-link` 后结束，
// 当时基本信息还没有对所有模板开放自定义字段；不补的话字段虽能保存，却只在新生成的
// 模板出现。新资产有同名节点，下面的检测会避免重复追加。
const LEGACY_TECH_DENSE_CUSTOM_INFO: BoxNode = {
  id: 'c-custom',
  type: 'Box',
  each: { path: 'info.customFields' },
  when: { and: [{ exists: 'name' }, { exists: 'value' }] },
  style: [{ flexDirection: 'row', alignItems: 'center', gap: 5 }],
  children: [
    { id: 'c-custom-icon', type: 'Icon', name: { read: 'icon' }, size: 9.5, style: [{ color: '#111827' }] },
    { id: 'c-custom-label', type: 'Text', value: '{{name}}：', style: [{ color: '#4b5563' }] },
    { id: 'c-custom-value', type: 'Text', value: { read: 'value' } },
  ],
};

const shouldInjectLegacyCustomInfo = (ctx: Ctx, node: BoxNode): boolean => {
  if (node.id !== 'contact' || (node.children ?? []).some((child) => child.id === 'c-custom')) {
    return false;
  }
  const ids = new Set((node.children ?? []).map((child) => child.id));
  if (!ids.has('c-phone') || !ids.has('c-who') || !ids.has('c-link')) return false;
  const info = ctx.resume.info as { customFields?: unknown } | undefined;
  return Array.isArray(info?.customFields) && info.customFields.length > 0;
};

/** catch-all 的保留路径：展开成「模板没显式声明的那些分区」。 */
export const UNHANDLED_SECTIONS = '$unhandledSections';

interface Scope {
  /** 当前迭代项，键名由 `each.as` 决定（缺省 `item`）。 */
  vars: Record<string, unknown>;
  index?: number;
  count?: number;
  /** 当前项来自哪个分区——编辑锚点要用。 */
  sectionKey?: string;
}

interface Ctx {
  resume: Record<string, unknown>;
  doc: TemplateDocument;
  diagnostics: Diagnostic[];
  nodes: number;
  /** 模板显式声明过的分区，catch-all 要排除它们。 */
  declaredSections: Set<string>;
  seq: number;
}

/**
 * 路径解析。三级回落，**顺序是承重的**：
 *
 * 1. 迭代变量名开头（`item.company`、`field.name`）
 * 2. **当前条目的属性**（`customFields`、`company`）
 * 3. 简历根（`info.fullName`、`sections.experience`）
 *
 * 第 2 级不是可有可无的糖：binding 本来就走 `getFieldEntry(scope.vars.item, …)`，
 * 也就是说 `{ read: 'company' }` 一直是相对条目的。若 `each` 只认根路径，
 * 同一棵树里两种写法的含义就不一样——`each: { path: 'customFields' }` 会**静默取到零项**，
 * 不报错、不警告，版面上只是少一块。这条回落让两者的直觉一致。
 */
const readPath = (ctx: Ctx, scope: Scope, path: string): unknown => {
  const head = path.split('.')[0];
  if (head in scope.vars) return get(scope.vars, path);
  const item = scope.vars.item as Record<string, unknown> | undefined;
  if (item && typeof item === 'object') {
    const fromItem = get(item, path);
    if (fromItem !== undefined) return fromItem;
  }
  const value = get(ctx.resume, path);
  if (value !== undefined) return value;

  const replacement = LEGACY_INFO_PATH_ALIASES[path];
  return replacement ? get(ctx.resume, replacement) : undefined;
};

/** `{{path}}` 插值。取不到就留空，**不留下 `undefined` 字样**。 */
const interpolate = (ctx: Ctx, scope: Scope, text: string): string =>
  text.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const value = readPath(ctx, scope, path.trim());
    return isPresent(value) ? String(value) : '';
  });

interface Resolved {
  text: string;
  /** 命中的具体键，编辑锚点用。 */
  fieldKey?: string;
}

/**
 * 解析一个 `Value`（字面量或 binding）。
 *
 * binding 的 `write` 缺省时从**命中的候选**推断——这正是 `getFieldEntry` 做的事，
 * 直接复用而不是另写一套：显示别名与可写键不是同一个东西，写错就是「改了没变」。
 */
const resolveValue = (ctx: Ctx, scope: Scope, value: Value): Resolved => {
  if (typeof value === 'string') return { text: interpolate(ctx, scope, value) };

  const binding: Binding = value;
  // 深路径的 `write` 在这里就丢掉，退回从命中候选推断。
  // 编译器不能假设校验器跑过——`validateTemplate` 是可选的一道闸，而这条是数据损坏。
  const write =
    typeof binding.write === 'string' && !/[.[\]]/.test(binding.write) ? binding.write : undefined;
  const candidates = Array.isArray(binding.read) ? binding.read : [binding.read];
  // 候选链在当前作用域里找；`getFieldEntry` 负责「第一个有值的赢」与「哪个键赢了」。
  const host = (scope.vars.item ?? ctx.resume) as Record<string, unknown>;
  const entry = getFieldEntry(host, candidates);
  if (entry) return { text: entry.value, fieldKey: write ?? entry.key };

  // 候选链在条目里没命中时，允许它是一条根路径（如 `info.fullName`）。
  for (const path of candidates) {
    const raw = readPath(ctx, scope, path);
    if (isPresent(raw)) {
      return { text: String(raw), fieldKey: write ?? path.split('.').pop() };
    }
  }
  return { text: binding.fallback ?? '' };
};

/** 编辑锚点。缺 sectionKey 或缺条目 id 都退化成只读——**这是静默的**，所以要记诊断。 */
const editAnchorOf = (
  ctx: Ctx,
  scope: Scope,
  fieldKey: string | undefined,
  kind: EditAnchor['kind'],
  nodeId: string,
): EditAnchor | undefined => {
  if (!fieldKey || !scope.sectionKey) return undefined;
  const item = scope.vars.item as Record<string, unknown> | undefined;
  const itemId = item?.id != null ? String(item.id) : undefined;
  if (item && !itemId) {
    ctx.diagnostics.push({
      level: 'warn',
      nodeId,
      message: `条目缺少 id，这个字段将不可编辑（sectionKey=${scope.sectionKey}）`,
    });
    return undefined;
  }
  // 「工作经历 · 第 2 条」——序号是**展开后**的，与用户在屏幕上数到的一致。
  const sectionTitle = zhTitleForSection(scope.sectionKey, scope.sectionKey);
  const label =
    scope.index === undefined ? sectionTitle : `${sectionTitle} · 第 ${scope.index + 1} 条`;
  return { sectionKey: scope.sectionKey, itemId, fieldKey, kind, label };
};

/** Box 上的 `section` 声明 → IR 的区块编辑元数据。两个字段都过插值。 */
const sectionEditorOf = (
  ctx: Ctx,
  scope: Scope,
  spec: BoxNode['section'],
): SectionEditor | undefined => {
  if (!spec) return undefined;
  const sectionKey = interpolate(ctx, scope, spec.sectionKey).trim();
  // 插值取不到就没有 key，此时给手柄等于给一个点了什么都不会发生的按钮。
  if (!sectionKey) return undefined;
  const title = spec.title
    ? interpolate(ctx, scope, spec.title).trim()
    : zhTitleForSection(sectionKey, sectionKey);
  // `each: $unhandledSections` 的当前项就是 `sectionOrder` 条目，优先从它拿；
  // 非迭代区块则按 key 回查。这样新树可以用 `{ read: 'icon' }`，而已经保存的
  // 旧树即使没有 Icon 节点也能在两个渲染后端显示用户当时选的图标。
  const currentItem = scope.vars.item;
  const currentIcon =
    currentItem && typeof currentItem === 'object' &&
    (currentItem as { key?: unknown }).key === sectionKey &&
    typeof (currentItem as { icon?: unknown }).icon === 'string'
      ? (currentItem as { icon: string }).icon
      : undefined;
  const sectionOrder = Array.isArray(ctx.resume.sectionOrder)
    ? (ctx.resume.sectionOrder as Array<{ key?: unknown; icon?: unknown }>)
    : [];
  const storedIcon = currentIcon ?? sectionOrder.find((item) => item?.key === sectionKey)?.icon;
  const icon = typeof storedIcon === 'string' && hasIcon(storedIcon) ? storedIcon : undefined;
  return {
    sectionKey,
    title,
    ...(icon ? { icon } : {}),
    handle: spec.handle,
    insertSlot: spec.insertSlot,
  };
};

/**
 * 解析文档级分页设置，填好缺省值。
 *
 * **默认 `single`**：既有 19 个模板都没有这个字段，而它们的既定行为就是单页随内容长高。
 * 让缺省值等于既定行为，是「新字段永远可选」这条兼容规则的具体落实。
 */
const resolvePage = (spec: TemplateDocument['page']): ResolvedPage => ({
  mode: spec?.mode === 'paged' ? 'paged' : 'single',
  size: spec?.size === 'Letter' ? 'Letter' : 'A4',
  marginPoints: Math.max(0, Math.min(120, Number(spec?.margin ?? 0))) * PX_TO_PT,
});

/** `each` 要迭代的数组。特殊路径展开成 catch-all。 */
const resolveEachItems = (
  ctx: Ctx,
  scope: Scope,
  path: string,
): Array<{ value: unknown; sectionKey?: string }> => {
  if (path === UNHANDLED_SECTIONS) {
    const order = (ctx.resume.sectionOrder ?? []) as Array<{ key: string }>;
    const sections = (ctx.resume.sections ?? {}) as Record<string, unknown>;
    return order
      .filter(
        (entry) =>
          entry?.key &&
          !ctx.declaredSections.has(entry.key) &&
          !isBuiltInSection(entry.key) &&
          Array.isArray(sections[entry.key]) &&
          (sections[entry.key] as unknown[]).length > 0,
      )
      .map((entry) => ({ value: entry, sectionKey: entry.key }));
  }

  // `each: {}` 这种缺 path 的写法必须在这里挡住。顶层虽然有兜底 catch，
  // 但那是**放弃整棵树**——一个坏节点让整份简历渲染不出来，比只掉这一个节点糟得多。
  if (typeof path !== 'string' || !path) return [];

  /*
   * 路径也过插值。**兜底节点靠这一条才有意义**：`$unhandledSections` 迭代出的是
   * `{key}`，要拿到那个分区的条目只能写 `sections.{{item.key}}`。不插值的话，
   * 兜底只印得出分区**名**、印不出内容——用户自建分区的正文照样消失，
   * 而「不让它消失」正是兜底存在的全部理由。
   *
   * 不含 `{{}}` 的路径原样返回，所以 `$unhandledSections` 这个哨兵不受影响。
   */
  const resolved = interpolate(ctx, scope, path);
  if (!resolved) return [];

  const raw = readPath(ctx, scope, resolved);
  // 绑到非数组按空处理——**永不抛**，否则一个错路径就让整份简历渲染不出来。
  if (!Array.isArray(raw)) return [];
  const sectionKey = resolved.startsWith('sections.')
    ? resolved.slice('sections.'.length).split('.')[0]
    : scope.sectionKey;
  return raw
    .filter((item) => {
      // 三种假值拼写都要认——历史数据里三种都出现过。
      const visible = (item as Record<string, unknown>)?.visible;
      return !(visible === false || visible === 'false' || visible === 0);
    })
    .map((value) => ({ value, sectionKey }));
};

function compileNode(
  ctx: Ctx,
  scope: Scope,
  node: TemplateNode,
  depth: number,
): ResolvedNode[] {
  if (depth > MAX_DEPTH) {
    ctx.diagnostics.push({
      level: 'error',
      nodeId: node.id,
      message: `嵌套超过 ${MAX_DEPTH} 层，已截断`,
    });
    return [];
  }
  if (ctx.nodes >= MAX_NODES) return [];

  // ── each：先展开，再对每个实例继续编译 ──
  if (node.each) {
    const items = resolveEachItems(ctx, scope, node.each.path);
    if (items.length > MAX_EACH) {
      ctx.diagnostics.push({
        level: 'warn',
        nodeId: node.id,
        message: `each 展开 ${items.length} 项，已截断到 ${MAX_EACH}`,
      });
    }
    const capped = items.slice(0, MAX_EACH);
    const varName = node.each.as ?? 'item';
    const out: ResolvedNode[] = [];

    capped.forEach((entry, index) => {
      const childScope: Scope = {
        vars: { ...scope.vars, [varName]: entry.value, item: entry.value },
        index,
        count: capped.length,
        sectionKey: entry.sectionKey ?? scope.sectionKey,
      };
      // `each` 已经消耗掉，避免无限展开
      const single = { ...node, each: undefined } as TemplateNode;
      out.push(...compileNode(ctx, childScope, single, depth));

      // 分隔符插在项**之间**，不是每项后面——否则末尾会多一个。
      const separator = node.type === 'Box' ? node.separator : undefined;
      if (separator && index < capped.length - 1) {
        out.push(...compileNode(ctx, childScope, separator, depth + 1));
      }
    });
    return out;
  }

  // ── when ──
  const conditionCtx = {
    index: scope.index,
    count: scope.count,
    read: (path: string) => readPath(ctx, scope, path),
  };
  // 仅无条件的历史联系方式行才注入兼容条件；任何新模板自己声明的 `when`
  // 始终优先，避免改变作者已经表达过的可见性语义。
  const condition = node.when ?? LEGACY_CONTACT_ROW_CONDITIONS[node.id];
  if (!evaluateCondition(condition, conditionCtx)) return [];

  ctx.nodes += 1;
  const instanceId = `${node.id}#${ctx.seq++}`;
  const style = resolveStyle(node.style, ctx.doc.styles);
  if (node.spacing) style.gap = SPACING_SCALE[node.spacing] ?? style.gap;

  const hrefValue = node.href
    ? resolveValue(ctx, scope, node.href).text
    : undefined;
  const base = {
    instanceId,
    templateNodeId: node.id,
    style,
    // 安全在这里收口：拿到 href 的唯一途径就是走过这道闸门。
    ...(hrefValue ? { href: safeHref(hrefValue) ?? undefined } : {}),
    ...(node.keepTogether ? { keepTogether: true } : {}),
  };

  switch (node.type) {
    case 'Box': {
      const childNodes = shouldInjectLegacyCustomInfo(ctx, node)
        ? [...(node.children ?? []), LEGACY_TECH_DENSE_CUSTOM_INFO]
        : (node.children ?? []);
      const groups = childNodes
        .map((child) => compileNode(ctx, scope, child, depth + 1))
        // 取不到值的子节点产出空数组。**先滤掉再插分隔符**，否则
        // 「手机号有、邮箱空」会渲成「138 ·」——一个没有下家的分隔符。
        .filter((group) => group.length > 0);

      /*
       * 分隔符也作用于**静态子节点**之间，不只是 `each` 的迭代项。
       *
       * 「电话 · 邮箱 · GitHub」这种表头行的字段是写死的三个节点，不是一次迭代。
       * 只支持 `each` 的话，这种极常见的形态只能靠在每个字段后面拼一个字符串，
       * 于是末尾必然多出一个——而那正是 `separator` 存在的理由。
       *
       * 语义是一致的：分隔符插在**这个 Box 渲染出来的相邻单元之间**，
       * 单元是迭代项（有 `each` 时）还是子节点（没有时），由 Box 自己决定。
       */
      const sep = node.separator;
      const children = sep
        ? groups.flatMap((group, i) =>
            i === 0 ? group : [...compileNode(ctx, scope, sep, depth + 1), ...group],
          )
        : groups.flat();
      const editor = sectionEditorOf(ctx, scope, node.section);
      return [{ ...base, type: 'Box', children, ...(editor ? { editor } : {}) }];
    }
    case 'Text': {
      const { text, fieldKey } = resolveValue(ctx, scope, node.value);
      if (!text) return [];
      const edit = editAnchorOf(ctx, scope, fieldKey, 'text', node.id);
      return [
        {
          ...base,
          type: 'Text',
          text,
          ...(node.role ? { role: node.role } : {}),
          ...(edit ? { edit } : {}),
        },
      ];
    }
    case 'RichText': {
      const { text, fieldKey } = resolveValue(ctx, scope, node.value);
      if (!text) return [];
      const edit = editAnchorOf(ctx, scope, fieldKey, 'richText', node.id);
      return [{ ...base, type: 'RichText', html: text, ...(edit ? { edit } : {}) }];
    }
    case 'List': {
      const items = (node.items ?? [])
        .map((item: ListItem) => ({
          text: resolveValue(ctx, scope, item.value).text,
          level: Math.max(0, Math.min(4, item.level ?? 0)),
        }))
        .filter((item) => item.text);
      if (!items.length) return [];
      return [{ ...base, type: 'List', ordered: node.ordered ?? false, items }];
    }
    case 'Image': {
      const src = resolveValue(ctx, scope, node.src).text;
      if (!src) return [];
      return [
        {
          ...base,
          type: 'Image',
          src,
          ...(node.width ? { width: node.width } : {}),
          ...(node.height ? { height: node.height } : {}),
          ...(node.fit ? { fit: node.fit } : {}),
        },
      ];
    }
    case 'Icon': {
      const { text: name } = resolveValue(ctx, scope, node.name);
      // 名字来自模型或持久化数据时绝不能直接喂给两个渲染器；只接受共享注册表里的项。
      if (!name || !hasIcon(name)) {
        ctx.diagnostics.push({
          level: 'warn',
          nodeId: node.id,
          message: `未知图标「${name || '空'}」，已忽略`,
        });
        return [];
      }
      return [
        { ...base, type: 'Icon', name, ...(node.size ? { size: node.size } : {}) },
      ];
    }
    default: {
      // 未知节点类型：走 fallback，没有就丢掉并记一条。
      // **两个后端从第一天就有这条路径**——没有降级故事的「先小」会逼出破坏性迁移。
      const unknown = node as TemplateNode;
      ctx.diagnostics.push({
        level: 'warn',
        nodeId: unknown.id,
        message: `未知节点类型：${String((unknown as { type?: string }).type)}`,
      });
      const fb = unknown.fallback;
      if (fb && fb !== 'drop') return compileNode(ctx, scope, fb, depth + 1);
      return [];
    }
  }
}

/** 收集模板显式声明过的分区——catch-all 要把它们排除掉。 */
const collectDeclaredSections = (node: TemplateNode, into: Set<string>): void => {
  if (node.each?.path?.startsWith('sections.')) {
    into.add(node.each.path.slice('sections.'.length).split('.')[0]);
  }
  if (node.type === 'Box') {
    for (const child of node.children ?? []) collectDeclaredSections(child, into);
    if (node.separator) collectDeclaredSections(node.separator, into);
  }
};

/**
 * 编译一棵模板树。
 *
 * **永不抛异常**：任何意外都变成 `diagnostics` 里的一条，外加一棵尽量能画的树。
 */
export function compile(
  doc: TemplateDocument,
  resume: Record<string, unknown>,
): CompileResult {
  const declaredSections = new Set<string>();
  try {
    collectDeclaredSections(doc.root, declaredSections);
  } catch {
    // 收集失败只影响 catch-all 的精确度，不该阻断编译。
  }

  const ctx: Ctx = {
    resume: resume ?? {},
    doc,
    diagnostics: [],
    nodes: 0,
    declaredSections,
    seq: 0,
  };

  // 分页设置在 try 外面解析：它不依赖任何节点，就算树整棵编译失败，
  // 调用方拿到的仍是一份可用的页设置，而不是 undefined。
  const page = resolvePage(doc.page);

  try {
    const roots = compileNode(ctx, { vars: {} }, doc.root, 0);
    if (roots.length <= 1) {
      return { root: roots[0] ?? null, page, diagnostics: ctx.diagnostics };
    }
    // 根节点带 `each`（或带 separator）会展开成多个兄弟。**不能只取第一个**——
    // 那会静默丢掉其余的。包一层容器而不是丢弃，并记一条：根上放 each 多半是笔误。
    ctx.diagnostics.push({
      level: 'warn',
      nodeId: doc.root.id,
      message: '根节点展开成了多个兄弟，已自动包一层容器',
    });
    return {
      root: {
        instanceId: `${doc.root.id}#root`,
        templateNodeId: doc.root.id,
        style: {},
        type: 'Box',
        children: roots,
      },
      page,
      diagnostics: ctx.diagnostics,
    };
  } catch (error) {
    ctx.diagnostics.push({
      level: 'error',
      message: `编译失败：${error instanceof Error ? error.message : String(error)}`,
    });
    return { root: null, page, diagnostics: ctx.diagnostics };
  }
}
