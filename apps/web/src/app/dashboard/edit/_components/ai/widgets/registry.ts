import { ChoiceCard, FormCard } from '@magic-resume/genui';
import TemplateGalleryCard from './TemplateGalleryCard';
import FabricationNotice from './FabricationNotice';
import JobResearchCard from './JobResearchCard';
import RecommendationChoiceCard from './RecommendationChoiceCard';
import ResearchBriefCard from './ResearchBriefCard';
import ApplicationTrackerCard, {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from './ApplicationTrackerCard';
import type {
  ResearchBriefGroup,
  ResearchBriefItem,
  ResearchBriefVariant,
} from './ResearchBriefCard';
import type { RecommendationOption } from '@magic-resume/genui/beautiful';
import type {
  WidgetFormField,
  WidgetOption,
  WidgetRegistry,
} from '@magic-resume/genui/contract';

/** `['a','b']` → options. Used for the many short, fixed lists below. */
const opts = (...labels: string[]): WidgetOption[] =>
  labels.map((label) => ({ value: label, label }));

const MAX_MODEL_OPTIONS = 30;
const MAX_OPTION_LABEL = 24;

/**
 * Clean a list of options the *model* wrote.
 *
 * Anywhere the model supplies option text we treat it as untrusted input: it
 * can repeat itself, run long, or hand back something that isn't a string at
 * all. Cleaning here keeps every consumer from having to be defensive, and an
 * empty result is a signal to fall back to free text rather than render a
 * chip row with nothing in it.
 */
function sanitizeOptions(raw: unknown): WidgetOption[] {
  return sanitizeRichOptions(raw).map(({ label }) => ({ value: label, label }));
}

const MAX_OPTION_WHY = 90;
const CONFIDENCE = new Set(['high', 'medium', 'low']);

/**
 * 同一份清洗，但保住模型给的理由与置信度。
 *
 * `ask_choice` 的选项从「字符串数组」放宽成了「字符串或 `{label, why, confidence}`」，
 * 两种写法混在一个数组里也合法——所以先在这里统一成一种形状，上面的
 * `sanitizeOptions` 再把它压回纯标签给不需要理由的卡。
 *
 * `why` 也要截断：它和 `label` 一样是模型写的，长度不由我们说了算。
 */
function sanitizeRichOptions(raw: unknown): RecommendationOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RecommendationOption[] = [];
  for (const item of raw) {
    const source =
      typeof item === 'string'
        ? { label: item }
        : isRecord(item) && typeof item.label === 'string'
          ? item
          : null;
    if (!source) continue;
    const label = String(source.label).trim().slice(0, MAX_OPTION_LABEL);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const why =
      typeof source.why === 'string' && source.why.trim()
        ? source.why.trim().slice(0, MAX_OPTION_WHY)
        : undefined;
    const confidence =
      typeof source.confidence === 'string' && CONFIDENCE.has(source.confidence)
        ? (source.confidence as RecommendationOption['confidence'])
        : undefined;
    out.push({
      label,
      ...(why ? { why } : {}),
      ...(confidence ? { confidence } : {}),
    });
    if (out.length >= MAX_MODEL_OPTIONS) break;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 这次的选择带没带「我推荐哪个」。
 *
 * 判据是模型**表了态**：给了 `recommended`，或至少一项写了理由/置信度。没表态就走
 * 普通的一排 chips——把没有主见的选择渲染成推荐卡，等于替模型编一个它没说过的倾向。
 */
function hasRecommendation(
  options: RecommendationOption[],
  recommended: unknown,
): boolean {
  if (typeof recommended === 'number' && Number.isInteger(recommended))
    return true;
  return options.some((o) => o.why !== undefined || o.confidence !== undefined);
}

/**
 * 岗位研究结果的分组与顺序固定在前端——模型只填每组的条目。`actionable` 的两组是
 * 用户下一步真能做的事（去补什么证据、去问 HR 什么），点一条即追问。
 */
const RESEARCH_GROUPS = [
  { key: 'must_have_skills', accent: '#38bdf8' },
  { key: 'selling_points', accent: '#34d399' },
  { key: 'mismatch_risks', accent: '#fbbf24' },
  { key: 'evidence_to_add', accent: '#a78bfa', actionable: true },
  { key: 'recruiter_questions', accent: '#22d3ee', actionable: true },
  { key: 'preparation_plan', accent: '#38bdf8' },
] as const;

interface ResearchGroupDefinition {
  key: string;
  accent: string;
  actionable?: boolean;
}

const COMPANY_RESEARCH_GROUPS = [
  { key: 'business_context', accent: '#38bdf8' },
  { key: 'hiring_signals', accent: '#22d3ee' },
  { key: 'role_implications', accent: '#34d399' },
  { key: 'compensation_leads', accent: '#a78bfa' },
  { key: 'risks_unknowns', accent: '#fbbf24' },
  { key: 'questions_to_verify', accent: '#38bdf8', actionable: true },
] as const;

const INTERVIEW_RESEARCH_GROUPS = [
  { key: 'focus_areas', accent: '#38bdf8' },
  { key: 'likely_questions', accent: '#a78bfa', actionable: true },
  { key: 'candidate_evidence', accent: '#34d399' },
  { key: 'practice_priorities', accent: '#fbbf24', actionable: true },
  { key: 'follow_up_questions', accent: '#22d3ee', actionable: true },
] as const;

const MAX_RESEARCH_GROUPS = 8;
const MAX_RESEARCH_ITEMS = 10;
const MAX_RESEARCH_TEXT = 800;
const APPLICATION_STATUS_SET = new Set<string>(APPLICATION_STATUSES);

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim().slice(0, max);
  return cleaned || undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  const raw = cleanString(value, 2048);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function domainOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function normalizeResearchItem(raw: unknown): ResearchBriefItem | null {
  if (typeof raw === 'string') {
    const text = cleanString(raw, MAX_RESEARCH_TEXT);
    return text ? { text } : null;
  }
  if (!isRecord(raw)) return null;

  const text = cleanString(
    raw.text ??
      raw.content ??
      raw.claim ??
      raw.label ??
      raw.title ??
      raw.finding,
    MAX_RESEARCH_TEXT,
  );
  if (!text) return null;

  const source = isRecord(raw.source)
    ? raw.source
    : Array.isArray(raw.sources) && isRecord(raw.sources[0])
      ? raw.sources[0]
      : undefined;
  const url = safeHttpUrl(
    raw.url ?? raw.sourceUrl ?? raw.href ?? source?.url ?? source?.href,
  );
  const sourceName = cleanString(
    raw.sourceName ?? raw.publisher ?? source?.name ?? source?.title,
    100,
  );
  const date = cleanString(
    raw.date ??
      raw.publishedDate ??
      raw.publishedAt ??
      source?.date ??
      source?.publishedDate,
    40,
  );
  return {
    text,
    ...(url ? { url, domain: domainOf(url) } : {}),
    ...(sourceName ? { sourceName } : {}),
    ...(date ? { date } : {}),
  };
}

function normalizeResearchItems(raw: unknown): ResearchBriefItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ResearchBriefItem[] = [];
  for (const value of raw) {
    const item = normalizeResearchItem(value);
    if (item) items.push(item);
    if (items.length >= MAX_RESEARCH_ITEMS) break;
  }
  return items;
}

function groupKey(value: unknown, fallback: string): string {
  const key = cleanString(value, 48)
    ?.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  return key && /^[a-z][a-z0-9_-]*$/i.test(key) ? key : fallback;
}

export function normalizeResearchWidgetProps(
  props: Record<string, unknown>,
  variant: ResearchBriefVariant,
): {
  variant: ResearchBriefVariant;
  title: string;
  groups: ResearchBriefGroup[];
} | null {
  const definitions: readonly ResearchGroupDefinition[] =
    variant === 'company' ? COMPANY_RESEARCH_GROUPS : INTERVIEW_RESEARCH_GROUPS;
  const byKey = new Map<string, ResearchGroupDefinition>(
    definitions.map((definition) => [definition.key, definition]),
  );
  // The original skill only said "compact groups" and old conversations may
  // therefore have emitted those arrays directly on props. Keep that legacy
  // shape renderable while the stricter skill contract rolls forward.
  const rawGroups = props.groups ?? props.sections ?? props.findings ?? props;
  const groups: ResearchBriefGroup[] = [];

  const append = (raw: unknown, index: number, suggestedKey?: string) => {
    const record = isRecord(raw) ? raw : undefined;
    const key = groupKey(
      record?.key ?? record?.id ?? record?.type ?? suggestedKey,
      definitions[index]?.key ?? `group_${index + 1}`,
    );
    const definition = byKey.get(key) ?? definitions[index];
    const items = normalizeResearchItems(
      Array.isArray(raw)
        ? raw
        : (record?.items ??
            record?.entries ??
            record?.findings ??
            record?.questions),
    );
    if (!items.length) return;
    groups.push({
      key,
      title: cleanString(record?.title ?? record?.label, 80),
      accent: definition?.accent ?? '#38bdf8',
      actionable:
        record?.actionable === true || definition?.actionable === true,
      items,
    });
  };

  if (Array.isArray(rawGroups)) {
    rawGroups
      .slice(0, MAX_RESEARCH_GROUPS)
      .forEach((group, index) => append(group, index));
  } else if (isRecord(rawGroups)) {
    const orderedKeys = [
      ...definitions
        .map((definition) => definition.key)
        .filter((key) => key in rawGroups),
      ...Object.keys(rawGroups).filter(
        (key) => !definitions.some((definition) => definition.key === key),
      ),
    ].slice(0, MAX_RESEARCH_GROUPS);
    orderedKeys.forEach((key, index) => append(rawGroups[key], index, key));
  }

  if (!groups.length) return null;
  const title =
    cleanString(
      props.title ??
        props.companyName ??
        props.company ??
        props.jobTitle ??
        props.role,
      120,
    ) ?? '';
  return { variant, title, groups };
}

function normalizeDate(value: unknown): string | undefined {
  const raw = cleanString(value, 64);
  if (!raw) return undefined;
  return Number.isNaN(new Date(raw).getTime()) ? undefined : raw;
}

export function normalizeApplicationTrackerProps(
  props: Record<string, unknown>,
): { applications: Array<Record<string, unknown>> } | null {
  if (!Array.isArray(props.applications)) return null;
  const applications: Array<Record<string, unknown>> = [];
  for (const [index, raw] of props.applications.entries()) {
    if (!isRecord(raw)) continue;
    const statusRaw = cleanString(raw.status, 24)?.toUpperCase();
    if (!statusRaw || !APPLICATION_STATUS_SET.has(statusRaw)) continue;
    const company = cleanString(raw.company, 120) ?? '';
    const role = cleanString(raw.role ?? raw.jobTitle ?? raw.title, 120) ?? '';
    if (!company && !role) continue;
    const status = statusRaw as ApplicationStatus;
    const sourceUrl = safeHttpUrl(raw.sourceUrl ?? raw.url);
    const id = cleanString(raw.id, 120) ?? `application_${index + 1}`;
    applications.push({
      id,
      company,
      role,
      status,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(cleanString(raw.location, 120)
        ? { location: cleanString(raw.location, 120) }
        : {}),
      ...(normalizeDate(raw.appliedAt)
        ? { appliedAt: normalizeDate(raw.appliedAt) }
        : {}),
      ...(normalizeDate(raw.nextActionAt)
        ? { nextActionAt: normalizeDate(raw.nextActionAt) }
        : {}),
      ...(normalizeDate(raw.updatedAt)
        ? { updatedAt: normalizeDate(raw.updatedAt) }
        : {}),
    });
    if (applications.length >= 50) break;
  }
  // `list` on a new account legitimately returns an empty board. Treating an
  // empty array as malformed makes WidgetHost fall back to “unsupported card”
  // precisely when the tracker should show its empty state. Invalid non-empty
  // rows are still rejected below so corrupt payloads do not masquerade as an
  // intentionally empty board.
  if (props.applications.length > 0 && applications.length === 0) return null;
  return { applications };
}

/**
 * The form layouts the agent can ask for by `formKind`. Fields live here rather
 * than in the tool schema, so the model picks *which* form and never gets to
 * emit a malformed one. Keep in sync with `request_form`'s enum and the skill
 * docs that name these kinds.
 *
 * Copy is Chinese-only, as the two original forms already were — the resume
 * audience is the Chinese market first (`.impeccable.md`). Worth lifting into
 * i18n along with the rest of `aiLab.widgets.*` when English ships.
 */
export const FORM_DEFS: Record<
  string,
  { title: string; fields: WidgetFormField[]; skippable?: boolean }
> = {
  job_info: {
    title: '目标岗位信息',
    fields: [
      {
        id: 'jd',
        label: '目标 JD',
        kind: 'textarea',
        placeholder: '粘贴目标职位描述，AI 将据此定向优化…',
      },
      {
        id: 'company',
        label: '公司',
        kind: 'search',
        source: 'companies',
        optional: true,
        placeholder: '例如 字节跳动',
      },
      {
        id: 'title',
        label: '岗位',
        kind: 'search',
        source: 'roles',
        optional: true,
        placeholder: '例如 高级产品经理',
      },
    ],
  },
  target_language: {
    title: '目标语言',
    fields: [
      {
        id: 'lang',
        label: '翻译成',
        kind: 'select',
        options: opts('English', '日本語', '한국어', 'Français'),
      },
    ],
  },
  analysis_evidence: {
    title: '补充可验证信息',
    skippable: true,
    fields: [
      {
        id: 'evidence',
        label: '真实背景与口径',
        kind: 'textarea',
        placeholder:
          '例如统计周期、样本量、对比基线、数据来源，或你实际负责的范围…',
      },
    ],
  },

  // ---- 引导创建 ----
  // 一步一张卡、每张卡三个以内的决策：客观可枚举的一律给控件，只有真正是叙述的
  // （这个项目你做了什么）才留自由文本，且可跳过。

  create_target: {
    title: '先定个方向',
    fields: [
      {
        id: 'role',
        label: '想投什么岗位',
        kind: 'chips',
        allowCustom: true,
        placeholder: '直接写你的目标岗位',
        options: opts(
          '前端开发',
          '后端开发',
          '移动端',
          '算法/AI',
          '数据分析',
          '测试',
          '运维/SRE',
          '产品经理',
          '运营',
          'UI/UX 设计',
          '市场',
          '人力/行政',
        ),
      },
      {
        id: 'industry',
        label: '行业方向',
        kind: 'chips',
        allowCustom: true,
        optional: true,
        options: opts(
          '互联网',
          'AI',
          '电商',
          '金融',
          '游戏',
          '硬件/制造',
          '教育',
          '医疗',
        ),
      },
      {
        id: 'seniority',
        label: '目前阶段',
        kind: 'segmented',
        options: opts('在校/应届', '实习', '1-3 年', '3-5 年', '5 年以上'),
      },
    ],
  },

  create_inventory: {
    title: '你手上有哪些材料',
    fields: [
      {
        id: 'materials',
        label: '有的都勾上，没有的先跳过',
        kind: 'multi-chips',
        allowCustom: true,
        options: opts(
          '教育经历',
          '实习经历',
          '全职工作',
          '项目经历',
          '竞赛获奖',
          '开源贡献',
          '论文/专利',
          '证书',
          '社团/组织',
        ),
      },
    ],
  },

  create_education: {
    title: '教育经历',
    skippable: true,
    fields: [
      {
        id: 'school',
        label: '学校',
        kind: 'search',
        source: 'schools',
        placeholder: '搜索或直接输入',
      },
      {
        id: 'degree',
        label: '学历',
        kind: 'chips',
        options: opts('大专', '本科', '硕士', '博士'),
      },
      {
        id: 'major',
        label: '专业',
        kind: 'search',
        source: 'majors',
        optional: true,
        placeholder: '搜索或直接输入',
      },
      { id: 'date', label: '起止时间', kind: 'month-range', optional: true },
    ],
  },

  create_experience: {
    title: '工作/实习经历',
    skippable: true,
    fields: [
      {
        id: 'company',
        label: '公司',
        kind: 'search',
        source: 'companies',
        placeholder: '搜索或直接输入',
      },
      {
        id: 'position',
        label: '岗位',
        kind: 'search',
        source: 'roles',
        placeholder: '搜索或直接输入',
      },
      { id: 'date', label: '起止时间', kind: 'month-range', optional: true },
      {
        id: 'highlight',
        label: '你在这儿做了什么',
        kind: 'textarea',
        optional: true,
        placeholder: '一两句就够，我来润色成简历措辞',
      },
    ],
  },

  create_project: {
    title: '项目经历',
    skippable: true,
    fields: [
      {
        id: 'name',
        label: '项目名称',
        kind: 'text',
        placeholder: '例如 内部数据看板',
      },
      {
        id: 'role',
        label: '你的角色',
        kind: 'text',
        optional: true,
        placeholder: '例如 主力开发',
      },
      {
        id: 'stack',
        label: '用到的技术',
        kind: 'multi-chips',
        optional: true,
        allowCustom: true,
        dynamicOptions: true,
        options: [],
      },
      { id: 'date', label: '起止时间', kind: 'month-range', optional: true },
      {
        id: 'highlight',
        label: '做了什么、结果如何',
        kind: 'textarea',
        optional: true,
        placeholder: '一两句就够，有数字更好',
      },
    ],
  },

  create_skills: {
    title: '挑出你会的',
    skippable: true,
    fields: [
      {
        id: 'skills',
        label: '按你的岗位挑的候选，漏了就自己加',
        kind: 'multi-chips',
        allowCustom: true,
        dynamicOptions: true,
        options: [],
      },
    ],
  },
};

/**
 * Which widgets this app's agent may surface. Components come from
 * `@magic-resume/genui`; the binding — kind, where the result goes, and how raw
 * tool args become props — is ours. Add a card = one entry here.
 */
export const WIDGETS: WidgetRegistry = {
  request_form: {
    component: FormCard,
    interaction: 'resume',
    normalize: (props) => {
      const formKind = typeof props.formKind === 'string' ? props.formKind : '';
      const def = FORM_DEFS[formKind];
      if (!def) return null; // unknown form → host shows a text fallback

      // The model may fill in the options of fields that opted into it, and
      // only those; everything else keeps our list. A field whose options come
      // back empty degrades to free text rather than an unusable empty row.
      const supplied = (props.options ?? {}) as Record<string, unknown>;
      const fields = def.fields.map((field) => {
        if (!field.dynamicOptions) return field;
        const options = sanitizeOptions(supplied[field.id]);
        return options.length
          ? { ...field, options }
          : { ...field, kind: 'text' as const, options: undefined };
      });

      return {
        formKind,
        title: def.title,
        fields,
        skippable: def.skippable ?? false,
        message: typeof props.message === 'string' ? props.message : '',
      };
    },
  },

  // 就地生效、不回后端：换模板是用户看着画布做的决定，绕一圈 agent 只会多一次
  // 停顿和一次计费。
  template_gallery: {
    component: TemplateGalleryCard,
    interaction: 'client',
    normalize: (props) => ({
      message: typeof props.message === 'string' ? props.message : '',
    }),
  },

  // 纯展示，用户没有要回答的东西——反捏造校验的提示，由引擎推送而非模型调用。
  fabrication_notice: {
    component: FabricationNotice,
    interaction: 'client',
    normalize: (props) => {
      const items = Array.isArray(props.items)
        ? props.items.filter(
            (x): x is string => typeof x === 'string' && Boolean(x.trim()),
          )
        : [];
      if (!items.length) return null;
      return {
        items,
        title: typeof props.title === 'string' ? props.title : '',
        body: typeof props.body === 'string' ? props.body : '',
      };
    },
  },

  /**
   * 收尾建议轨：跑完一段工作后浮现的「下一步」。与 ask_choice 同一个组件、不同语义
   * ——它由 push_ui 非阻塞推送，流不会停在这里等；点一下等于替用户说了那句话，所以
   * 结果走 `message` 而不是续跑某次中断。任何流程跑完就断在这儿，是此前最大的漏斗口。
   */
  suggestion_rail: {
    component: ChoiceCard,
    interaction: 'message',
    normalize: (props) => {
      const options = sanitizeOptions(props.options);
      if (!options.length) return null;
      return {
        message: typeof props.message === 'string' ? props.message : '',
        options,
        allowFreeText: false,
      };
    },
  },

  /**
   * 岗位研究的结构化结果。分组固定在前端（模型只填内容），可执行的两组点一下就变成
   * 下一轮对话，所以走 `message`。
   */
  job_research: {
    component: JobResearchCard,
    interaction: 'message',
    normalize: (props) => {
      const src = (props.groups ?? {}) as Record<string, unknown>;
      const groups = RESEARCH_GROUPS.map((g) => ({
        ...g,
        items: sanitizeOptions(src[g.key]).map((o) => o.label),
      })).filter((g) => g.items.length);
      if (!groups.length) return null;
      return {
        jobTitle: typeof props.jobTitle === 'string' ? props.jobTitle : '',
        groups,
      };
    },
  },

  company_research: {
    component: ResearchBriefCard,
    interaction: 'message',
    normalize: (props) => normalizeResearchWidgetProps(props, 'company'),
  },

  interview_prep: {
    component: ResearchBriefCard,
    interaction: 'message',
    normalize: (props) => normalizeResearchWidgetProps(props, 'interview'),
  },

  application_tracker: {
    component: ApplicationTrackerCard,
    interaction: 'client',
    normalize: normalizeApplicationTrackerProps,
  },

  ask_choice: {
    component: ChoiceCard,
    interaction: 'resume',
    normalize: (props) => {
      const message =
        typeof props.message === 'string' ? props.message.trim() : '';
      const options = sanitizeOptions(props.options);
      // Both are the whole card — a question with no answers, or answers with
      // no question, is not something to render half of.
      if (!message || options.length < 2) return null;
      return { message, options, allowFreeText: props.allowFreeText === true };
    },
  },

  /**
   * `ask_choice` 表了态的那一支：主推项占满卡面并带理由，其余收进抽屉。
   *
   * 它不是一个独立的工具——中断分发时按 `hasRecommendation` 把 `ask_choice` 改写成这个
   * kind。提交发的仍是 `{ choice }`，所以 HITL 的 `edit` 那条路一行未改。
   */
  ask_choice_recommended: {
    component: RecommendationChoiceCard,
    interaction: 'resume',
    normalize: (props) => {
      const message =
        typeof props.message === 'string' ? props.message.trim() : '';
      const options = sanitizeRichOptions(props.options);
      if (!message || options.length < 2) return null;
      const raw = props.recommended;
      const recommended =
        typeof raw === 'number' &&
        Number.isInteger(raw) &&
        raw >= 0 &&
        raw < options.length
          ? raw
          : 0;
      return { message, options, recommended };
    },
  },
};

/** 中断分发用：这一次 `ask_choice` 该走推荐卡还是普通选择卡。 */
export function askChoiceKind(
  args: Record<string, unknown> | undefined,
): string {
  const options = sanitizeRichOptions(args?.options);
  return hasRecommendation(options, args?.recommended)
    ? 'ask_choice_recommended'
    : 'ask_choice';
}
