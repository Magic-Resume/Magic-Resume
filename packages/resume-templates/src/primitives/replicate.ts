import type { TemplateDocument, TemplateNode } from './ast';
import { UNHANDLED_SECTIONS, compile } from './compile';
import { isBuiltInSection } from '../sectionSemantics';
import { normalizeStyles } from './normalize';
import { templateJsonSchema } from './schema';
import { validateTemplate } from './validate';

/**
 * AI 复刻模板的管线。**模型无关**——调用方传一个 `generate` 回调进来。
 *
 * 这样分层不是为了好看：真正的模型调用（带视觉、带重试、带计费）在 agent-service 里，
 * 而这个包不该知道那些。反过来，**critique 那一步的确定性部分必须在这里**——
 * 它依赖编译器、校验器和真渲染，那些都在这个包。
 *
 * ## 为什么不能只靠 schema
 *
 * 业界实测：**结构化输出保证 schema，不保证质量**——某管线 schema 合法率 99.4%，
 * 但约 11% 的结果语义上是错的：受约束解码屏蔽掉模型偏好的 token 之后，
 * 它塌陷到「能满足语法的安全默认值」。**加严 schema 有时反而制造问题。**
 *
 * 所以走 `render → critique → revise` 闭环（UI2Code^N / VisRefiner 有论文支撑）。
 * 这个闭环对我们特别便宜：两个渲染器都是现成的，别人要为此起一个浏览器。
 *
 * ## critique 查的五件事
 *
 * | 查什么 | 不查会怎样 |
 * |---|---|
 * | 结构合法 | 树根本编译不出来 |
 * | **分区覆盖** | 好看的模板只绑了 experience，education **静默消失** |
 * | 可编辑字段用的是 binding | 就地编辑**静默变只读**，用户点了没反应 |
 * | 有 catch-all | 用户自建的分区**静默消失** |
 * | 真渲染 + 页数 | 导出时才发现字体没注册、内容溢出 |
 *
 * 五件里有三件的失败模式是「静默消失」——那正是这整层架构存在的理由。
 *
 * **前四项是纯函数、零依赖**，服务端与浏览器都能跑。只有第五项需要渲染器，
 * 所以它是注入进来的（`CritiqueOptions.measure`），而不是硬编码在这里。
 * 硬编码的代价很具体：为了一项检查，把 react-dom + react-pdf 拖进一个 Nest 服务。
 */

/** 给模型看的写作约束。**schema 表达不了的规则都在这里**，逐条都有代价说明。 */
export const REPLICATE_INSTRUCTIONS = `你要把参考版式复刻成一棵模板树（JSON），交给一个既能渲染成网页、
也能渲染成 PDF 的排版引擎。

## 铁律

1. **不要把参考图上的简历正文抄进模板。** 那是别人的简历内容。所有会变的文字都必须写成
   绑定（\`{"read": "company"}\`），只有分区标题这类固定标签才写字面量。
   抄进去的后果：用户打开看到的是别人的经历。

2. **每一个非空分区都要有归宿，而且分两档。**
   - 内建分区（experience / education / projects / skills / languages / certificates / profiles）
     **必须逐个显式绑定**。兜底节点**接不住它们**。
   - 另外还要有一个 \`each: {"path": "${UNHANDLED_SECTIONS}"}\` 的兜底节点，接住用户自建的分区。

   漏了哪一档，那部分内容都**不报错，只是消失**。

3. **可编辑的字段必须是绑定，不能是插值字符串。** \`{"read": "summary"}\` 可编辑，
   \`"{{summary}}"\` 不可编辑——后者渲染出来一模一样，但用户点上去没有任何反应，
   也没有任何提示。

4. **\`each\` 与 \`when\` 是属性，不是节点。** 写在需要重复/条件的那个节点自己身上。

5. **长度单位一律是 CSS px 数字**，不要写 \`"12px"\` 这种字符串。

6. **字重只有 400 和 700。** 别的值会让网页与 PDF 长得不一样，而且两边都不报错。

## 版式建议

- 小节标题的横线用标题节点自己的 \`borderBottomWidth\`，不要插一个单独的分隔节点——
  多一个兄弟元素会把间距算错。
- 「A · B · C」这种形态用 Box 的 \`separator\`，不要每项后面加一个（末尾会多出来）。
- 要点列表用 \`List\` 节点，每项自带 \`level\`。不要手搓「圆点 + 文字」的两列 Box。`;

export type CritiqueKind =
  | 'structure'
  | 'coverage'
  | 'binding'
  | 'catchAll'
  | 'render'
  | 'overflow';

export interface CritiqueProblem {
  kind: CritiqueKind;
  message: string;
  nodeId?: string;
  /** 阻断性问题必须修；非阻断的是质量建议。 */
  blocking: boolean;
}

export interface CritiqueReport {
  ok: boolean;
  problems: CritiqueProblem[];
  pages: number;
  bytes: number;
}

/**
 * 一次真渲染的测量结果。
 *
 * **谁来渲染由调用方决定**，这一层只定契约。这不是可有可无的抽象：
 * 五项检查里只有这一项需要渲染器，把整个 critique 绑死在某个渲染后端上，
 * 等于为了一项检查给所有调用方拖进一整套渲染依赖。
 */
export interface RenderMeasurement {
  ok: boolean;
  pages: number;
  bytes: number;
  error?: string;
}

export type MeasureFn = (
  doc: TemplateDocument,
  resume: Record<string, unknown>,
) => Promise<RenderMeasurement>;

export interface CritiqueOptions {
  maxPages?: number;
  /**
   * 怎么测量「画出来放不放得下」。**省略就只做结构检查**（那四项是纯函数，零依赖）。
   *
   * ## 首选浏览器，不是服务端
   *
   * 浏览器里已经同时装着两个渲染器，而且它**测得更准**：真实字体（CJK 子集字体
   * 与服务端注册的并不一样）、真实 DOM 布局、`scrollHeight` 直接量。
   * 服务端要重新注册一遍字体去逼近浏览器的结果，是把简单的事做复杂。
   *
   * `@magic-resume/resume-templates/server` 里的 Node 版测量器仍然有用——
   * CI 与冒烟需要一个不依赖浏览器的量法。
   */
  measure?: MeasureFn;
}

/** 深度优先遍历，含 `separator` 与 `fallback`——漏掉它们等于漏掉降级路径。 */
function* walk(node: TemplateNode): Generator<TemplateNode> {
  yield node;
  if (node.type === 'Box') {
    for (const child of node.children ?? []) yield* walk(child);
    if (node.separator) yield* walk(node.separator);
  }
  if (node.fallback && typeof node.fallback === 'object') yield* walk(node.fallback);
}

/**
 * 分区覆盖。**这一条是从真实事故里长出来的。**
 *
 * `summary` / `awards` 曾经在导出的 PDF 里凭空消失，原因是两个渲染器各存了一份
 * 「哪些分区是内建的」然后漂了。AI 复刻会以另一种方式重现同一个失败：
 * 模型盯着参考图，图上没有的分区它就不写，于是用户简历里那一块**静默消失**。
 *
 * ⚠️ **兜底节点只接用户自建的分区，接不住内建分区。** `resolveEachItems` 对
 * `$unhandledSections` 显式跳过了 `isBuiltInSection` 的那七个 key——在 legacy 世界里，
 * 模板不声明内建分区被视为「有意省略」，自动合成一个出来反而会把 i18n key 印在纸上。
 *
 * 所以这里的判据必须分两档，否则就会出现最坏的一种：**critique 说通过、渲染器却把它丢了**。
 * 一棵写了兜底但漏绑 education 的树，看起来什么都对。
 *
 * - **内建分区**（experience/education/…）：必须被显式 `each` 到
 * - **自建分区**：显式绑定或有兜底节点，二者其一即可
 */
const uncoveredSections = (doc: TemplateDocument, resume: Record<string, unknown>): string[] => {
  const declared = new Set<string>();
  let hasCatchAll = false;
  for (const node of walk(doc.root)) {
    const path = node.each?.path;
    if (!path) continue;
    if (path === UNHANDLED_SECTIONS) hasCatchAll = true;
    else if (path.startsWith('sections.')) declared.add(path.slice('sections.'.length).split('.')[0]);
  }

  const sections = (resume.sections ?? {}) as Record<string, unknown>;
  return Object.keys(sections).filter((key) => {
    const items = sections[key];
    if (!Array.isArray(items) || items.length === 0) return false;
    if (declared.has(key)) return false;
    return isBuiltInSection(key) || !hasCatchAll;
  });
};

export async function critiqueTemplate(
  doc: unknown,
  resume: Record<string, unknown>,
  options: CritiqueOptions,
): Promise<CritiqueReport> {
  const problems: CritiqueProblem[] = [];

  const structural = validateTemplate(doc);
  for (const d of structural.diagnostics) {
    problems.push({
      kind: d.message.includes('自建分区将不会显示') ? 'catchAll' : 'structure',
      message: d.message,
      nodeId: d.nodeId,
      blocking: d.level === 'error',
    });
  }
  if (!structural.ok) {
    // 结构不合法就不必渲染了：渲染失败的原因会指向排版，而真正的问题在结构。
    return { ok: false, problems, pages: 0, bytes: 0 };
  }

  const template = doc as TemplateDocument;

  for (const key of uncoveredSections(template, resume)) {
    problems.push({
      kind: 'coverage',
      message: isBuiltInSection(key)
        ? `内建分区「${key}」有内容但没有任何节点绑定它——兜底节点接不住内建分区，这一块会静默消失`
        : `分区「${key}」有内容但树里没有任何节点绑定它，也没有兜底节点——这一块会静默消失`,
      blocking: true,
    });
  }

  // 可编辑性：编译一次看有多少字段真的拿到了编辑锚点。
  // 一棵「渲染正确但全是插值字符串」的树在画面上完全正常，只是点不动。
  const { root, diagnostics } = compile(template, resume);
  for (const d of diagnostics) {
    if (d.message.includes('不可编辑')) {
      problems.push({ kind: 'binding', message: d.message, nodeId: d.nodeId, blocking: false });
    }
  }
  if (root) {
    let editable = 0;
    const countEditable = (n: typeof root): void => {
      if ((n.type === 'Text' || n.type === 'RichText') && n.edit) editable++;
      if (n.type === 'Box') n.children.forEach(countEditable);
    };
    countEditable(root);
    if (editable === 0) {
      problems.push({
        kind: 'binding',
        message: '整棵树没有任何可编辑字段——渲染出来看着正常，但用户点哪里都没反应，且没有任何提示',
        blocking: true,
      });
    }
  }

  // 没给测量器就到此为止：前面四项都做完了，它们才是这一层的主要价值。
  if (!options.measure) {
    return { ok: problems.every((p) => !p.blocking), problems, pages: 0, bytes: 0 };
  }

  const measured = await options.measure(template, resume);
  if (!measured.ok) {
    problems.push({
      kind: 'render',
      message: `渲染失败：${measured.error ?? '未知原因'}`,
      blocking: true,
    });
  } else if (measured.pages > (options.maxPages ?? 1)) {
    problems.push({
      kind: 'overflow',
      message: `内容占了 ${measured.pages} 页，超过上限 ${options.maxPages ?? 1} 页`,
      blocking: true,
    });
  }

  return {
    ok: problems.every((p) => !p.blocking),
    problems,
    pages: measured.pages,
    bytes: measured.bytes,
  };
}

/** 交给模型的一轮请求。首轮没有 `previous` / `critique`。 */
export interface GenerateRequest {
  schema: typeof templateJsonSchema;
  instructions: string;
  round: number;
  previous?: TemplateDocument;
  critique?: CritiqueReport;
}

export type GenerateFn = (request: GenerateRequest) => Promise<unknown>;

export interface ReplicateOptions extends CritiqueOptions {
  /** 最多来回几轮。默认 3——再多通常是模型在原地打转，不是快要成功了。 */
  maxRounds?: number;
}

export interface ReplicateResult {
  /** 通过全部阻断性检查的树。没通过就是 undefined。 */
  document?: TemplateDocument;
  /** 每一轮的 critique，供排查与观测。 */
  rounds: CritiqueReport[];
  /** 即使失败也带出最后一次的树，便于人看到模型卡在哪。 */
  lastAttempt?: TemplateDocument;
}

export async function replicateTemplate(
  generate: GenerateFn,
  resume: Record<string, unknown>,
  options: ReplicateOptions,
): Promise<ReplicateResult> {
  const maxRounds = options.maxRounds ?? 3;
  const rounds: CritiqueReport[] = [];
  let previous: TemplateDocument | undefined;
  let critique: CritiqueReport | undefined;

  for (let round = 1; round <= maxRounds; round++) {
    let raw: unknown;
    try {
      raw = await generate({
        schema: templateJsonSchema,
        instructions: REPLICATE_INSTRUCTIONS,
        round,
        previous,
        critique,
      });
    } catch (error) {
      // 模型调用本身失败（超时、限流）不该让整个管线抛——上游要能看到已经跑过的轮次。
      rounds.push({
        ok: false,
        problems: [
          {
            kind: 'structure',
            message: `生成失败：${error instanceof Error ? error.message : String(error)}`,
            blocking: true,
          },
        ],
        pages: 0,
        bytes: 0,
      });
      break;
    }

    critique = await critiqueTemplate(raw, resume, options);
    rounds.push(critique);
    previous = raw as TemplateDocument;

    if (critique.ok) {
      // 归一化放在**通过之后**：它不改变渲染结果，但会改变树的形状，
      // 放在 critique 之前会让模型下一轮收到一棵自己没写过的树，白白增加困惑。
      return { document: normalizeStyles(previous).document, rounds, lastAttempt: previous };
    }
  }

  return { rounds, lastAttempt: previous };
}
