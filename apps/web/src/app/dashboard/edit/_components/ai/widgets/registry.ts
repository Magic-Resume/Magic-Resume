import { ChoiceCard, FormCard } from '@magic-resume/genui';
import TemplateGalleryCard from './TemplateGalleryCard';
import TemplateReplicaCard from './TemplateReplicaCard';
import FabricationNotice from './FabricationNotice';
import JobResearchCard from './JobResearchCard';
import RecommendationChoiceCard from './RecommendationChoiceCard';
import ResearchBriefCard from './ResearchBriefCard';
import InterviewRoomCard from './InterviewRoomCard';
import ApplicationTrackerCard, {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from './ApplicationTrackerCard';
import CompanyLogoPickerCard, { type CompanyLogoChoice } from './CompanyLogoPickerCard';
import TrackerFieldsCard from './TrackerFieldsCard';
import type {
  ResearchBriefGroup,
  ResearchBriefItem,
  ResearchBriefVariant,
} from './ResearchBriefCard';
import type { RecommendationOption } from '@magic-resume/genui/beautiful';
import type { WidgetFormField, WidgetOption, WidgetRegistry } from '@magic-resume/genui/contract';

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

function sanitizeLogoUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const url = value.trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') continue;
    } catch {
      continue;
    }
    if (!urls.includes(url)) urls.push(url);
    if (urls.length >= 4) break;
  }
  return urls;
}

function normalizeCompanyLogoChoices(options: unknown): CompanyLogoChoice[] {
  if (!isRecord(options)) return [];
  const names = [
    ...new Set(
      sanitizeOptions(options.companies)
        .map((option) => option.label.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
  return names.map((name) => ({
    name,
    candidates: sanitizeLogoUrls(options[`candidates:${name}`]),
  }));
}

/**
 * 这次的选择带没带「我推荐哪个」。
 *
 * 判据是模型**表了态**：给了 `recommended`，或至少一项写了理由/置信度。没表态就走
 * 普通的一排 chips——把没有主见的选择渲染成推荐卡，等于替模型编一个它没说过的倾向。
 */
function hasRecommendation(options: RecommendationOption[], recommended: unknown): boolean {
  if (typeof recommended === 'number' && Number.isInteger(recommended)) return true;
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

const JOB_RESEARCH_TONE_ACCENTS: Record<string, string> = {
  info: '#38bdf8',
  positive: '#34d399',
  success: '#34d399',
  warning: '#fbbf24',
  risk: '#fb7185',
  danger: '#fb7185',
  neutral: '#94a3b8',
};

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
    raw.text ?? raw.content ?? raw.claim ?? raw.label ?? raw.title ?? raw.finding,
    MAX_RESEARCH_TEXT,
  );
  if (!text) return null;

  const source = isRecord(raw.source)
    ? raw.source
    : Array.isArray(raw.sources) && isRecord(raw.sources[0])
      ? raw.sources[0]
      : undefined;
  const url = safeHttpUrl(raw.url ?? raw.sourceUrl ?? raw.href ?? source?.url ?? source?.href);
  const sourceName = cleanString(
    raw.sourceName ?? raw.publisher ?? source?.name ?? source?.title,
    100,
  );
  const date = cleanString(
    raw.date ?? raw.publishedDate ?? raw.publishedAt ?? source?.date ?? source?.publishedDate,
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
        : (record?.items ?? record?.entries ?? record?.findings ?? record?.questions),
    );
    if (!items.length) return;
    groups.push({
      key,
      title: cleanString(record?.title ?? record?.label, 80),
      accent: definition?.accent ?? '#38bdf8',
      actionable: record?.actionable === true || definition?.actionable === true,
      items,
    });
  };

  if (Array.isArray(rawGroups)) {
    rawGroups.slice(0, MAX_RESEARCH_GROUPS).forEach((group, index) => append(group, index));
  } else if (isRecord(rawGroups)) {
    const orderedKeys = [
      ...definitions.map((definition) => definition.key).filter((key) => key in rawGroups),
      ...Object.keys(rawGroups).filter(
        (key) => !definitions.some((definition) => definition.key === key),
      ),
    ].slice(0, MAX_RESEARCH_GROUPS);
    orderedKeys.forEach((key, index) => append(rawGroups[key], index, key));
  }

  if (!groups.length) return null;
  const title =
    cleanString(
      props.title ?? props.companyName ?? props.company ?? props.jobTitle ?? props.role,
      120,
    ) ?? '';
  return { variant, title, groups };
}

/**
 * 岗位调研先后公开过两种 wire shape：旧版是按固定 key 分组的对象，当前 push_ui
 * 契约则是 `[{ title, tone, items }]`。历史消息已经持久化，前端必须两种都能读；只改
 * 后端会让用户已经收到的卡片永远停在「无法渲染」。
 */
export function normalizeJobResearchProps(props: Record<string, unknown>): {
  jobTitle: string;
  groups: Array<{
    key: string;
    title?: string;
    items: string[];
    accent: string;
    actionable?: boolean;
  }>;
} | null {
  const rawGroups = props.groups;
  const byKey = new Map<string, ResearchGroupDefinition>(
    RESEARCH_GROUPS.map((definition) => [definition.key, definition]),
  );
  const groups: Array<{
    key: string;
    title?: string;
    items: string[];
    accent: string;
    actionable?: boolean;
  }> = [];
  const seen = new Set<string>();

  const append = (raw: unknown, index: number, suggestedKey?: string) => {
    const record = isRecord(raw) ? raw : undefined;
    const definition: ResearchGroupDefinition | undefined =
      (suggestedKey ? byKey.get(suggestedKey) : undefined) ?? RESEARCH_GROUPS[index];
    const baseKey = groupKey(
      record?.key ?? record?.id ?? record?.type ?? suggestedKey,
      definition?.key ?? `group_${index + 1}`,
    );
    const key = seen.has(baseKey) ? `${baseKey}_${index + 1}` : baseKey;
    const items = normalizeResearchItems(
      Array.isArray(raw)
        ? raw
        : (record?.items ?? record?.entries ?? record?.findings ?? record?.questions),
    ).map((item) => item.text);
    if (!items.length) return;

    const tone = cleanString(record?.tone, 24)?.toLowerCase();
    seen.add(key);
    groups.push({
      key,
      ...(cleanString(record?.title ?? record?.label, 80)
        ? { title: cleanString(record?.title ?? record?.label, 80) }
        : {}),
      items,
      accent:
        (tone ? JOB_RESEARCH_TONE_ACCENTS[tone] : undefined) ??
        definition?.accent ??
        '#38bdf8',
      ...(record?.actionable === true || definition?.actionable === true
        ? { actionable: true }
        : {}),
    });
  };

  if (Array.isArray(rawGroups)) {
    rawGroups.slice(0, MAX_RESEARCH_GROUPS).forEach((group, index) => append(group, index));
  } else if (isRecord(rawGroups)) {
    const orderedKeys = [
      ...RESEARCH_GROUPS.map((definition) => definition.key).filter((key) => key in rawGroups),
      ...Object.keys(rawGroups).filter(
        (key) => !RESEARCH_GROUPS.some((definition) => definition.key === key),
      ),
    ].slice(0, MAX_RESEARCH_GROUPS);
    orderedKeys.forEach((key, index) => append(rawGroups[key], index, key));
  }

  if (!groups.length) return null;
  return {
    jobTitle:
      cleanString(props.jobTitle ?? props.title ?? props.message, 160) ?? '',
    groups,
  };
}

function normalizeDate(value: unknown): string | undefined {
  const raw = cleanString(value, 64);
  if (!raw) return undefined;
  return Number.isNaN(new Date(raw).getTime()) ? undefined : raw;
}

/** 内置列的键。自定义列不在此列，它们的值走 `fields`。 */
const BUILTIN_TRACKER_COLUMNS = new Set([
  'company',
  'role',
  'status',
  'appliedAt',
  'nextActionAt',
  'sourceUrl',
  'location',
  'notes',
]);

/**
 * 面板列。`label` 只对自定义列有意义——内置列的显示名归前端 i18n，跟随界面语言，
 * 后端存的是空串。
 */
function normalizeTrackerColumns(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const columns: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const key = cleanString(raw.key, 60);
    if (!key || seen.has(key)) continue;
    const builtin = BUILTIN_TRACKER_COLUMNS.has(key);
    const label = cleanString(raw.label, 60) ?? '';
    // 自定义列没有名字就没法显示——丢掉，而不是渲染一个无头的列。
    if (!builtin && !label) continue;
    seen.add(key);
    columns.push({
      key,
      builtin,
      label,
      type: cleanString(raw.type, 40) ?? 'Text',
      source: raw.source === 'ai' ? 'ai' : 'user',
      ...(cleanString(raw.prompt, 2_000) ? { prompt: cleanString(raw.prompt, 2_000) } : {}),
    });
    if (columns.length >= 12) break;
  }
  return columns;
}

/** 自定义列在这一行的取值。`computedAt` 缺席 = 还没算过，前端据此显示「计算中」。 */
function normalizeTrackerFields(value: unknown): Record<string, { value: string; computed: boolean }> {
  const fields: Record<string, { value: string; computed: boolean }> = {};
  if (!isRecord(value)) return fields;
  for (const [key, raw] of Object.entries(value)) {
    if (!isRecord(raw)) continue;
    const cleanKey = cleanString(key, 60);
    if (!cleanKey || BUILTIN_TRACKER_COLUMNS.has(cleanKey)) continue;
    fields[cleanKey] = {
      value: cleanString(raw.value, 2_000) ?? '',
      computed: Boolean(cleanString(raw.computedAt, 64)),
    };
    if (Object.keys(fields).length >= 12) break;
  }
  return fields;
}

export function normalizeApplicationTrackerProps(
  props: Record<string, unknown>,
): {
  columns: Array<Record<string, unknown>>;
  applications: Array<Record<string, unknown>>;
} | null {
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
      ...(cleanString(raw.location, 120) ? { location: cleanString(raw.location, 120) } : {}),
      ...(normalizeDate(raw.appliedAt) ? { appliedAt: normalizeDate(raw.appliedAt) } : {}),
      ...(normalizeDate(raw.nextActionAt) ? { nextActionAt: normalizeDate(raw.nextActionAt) } : {}),
      ...(normalizeDate(raw.updatedAt) ? { updatedAt: normalizeDate(raw.updatedAt) } : {}),
      ...(cleanString(raw.notes, 2_000) ? { notes: cleanString(raw.notes, 2_000) } : {}),
      fields: normalizeTrackerFields(raw.fields),
    });
    if (applications.length >= 50) break;
  }
  // `list` on a new account legitimately returns an empty board. Treating an
  // empty array as malformed makes WidgetHost fall back to “unsupported card”
  // precisely when the tracker should show its empty state. Invalid non-empty
  // rows are still rejected below so corrupt payloads do not masquerade as an
  // intentionally empty board.
  if (props.applications.length > 0 && applications.length === 0) return null;
  return { columns: normalizeTrackerColumns(props.columns), applications };
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
  {
    title: string;
    fields: WidgetFormField[];
    skippable?: boolean;
    /**
     * 这一种的字段由 `options[<key>]` 里的名字**逐个生成**，而不是写死在 `fields` 里。
     * 只有「要问哪几项」运行时才知道的表单需要它（目前仅 `company_logos`）。
     */
    fromOptions?: string;
  }
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
        placeholder: '例如统计周期、样本量、对比基线、数据来源，或你实际负责的范围…',
      },
    ],
  },

  /**
   * 旧会话里的 company_logos 通用表单兜底。新运行会由 requestFormKind 路由到带预览的
   * CompanyLogoPickerCard；保留这一份是为了让已持久化的旧中断仍可回答。
   *
   * **字段是动态的**——一家公司一个输入框，公司名由 agent 通过 `options.companies` 给。
   * 这是这张表里唯一一个字段不固定的 kind（见下面 `fromOptions`），因为「要问哪几家」
   * 只有运行时才知道；其余 kind 的字段仍然写死在这里，模型只挑 kind、编不出畸形表单。
   *
   * 整张卡可跳过：拿不到就空着是既定行为（绝不用通用图标顶替），所以「跳过」是一个
   * 正当答案，不是放弃。
   */
  company_logos: {
    title: '补几个公司 logo',
    skippable: true,
    fromOptions: 'companies',
    fields: [],
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
        options: opts('互联网', 'AI', '电商', '金融', '游戏', '硬件/制造', '教育', '医疗'),
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
  /**
   * `replicate_template` runs in the agent, but previewing and applying its
   * JSON tree belong in the browser: it has the active résumé and is where the
   * user can make the irreversible-looking choice explicitly.
   */
  template_replica: {
    component: TemplateReplicaCard,
    interaction: 'client',
    normalize: (props) => {
      const template = props.template;
      if (!isRecord(template)) return null;
      return {
        template,
        ...(typeof props.note === 'string' && props.note.trim()
          ? { note: props.note.trim().slice(0, 200) }
          : {}),
      };
    },
  },

  company_logo_picker: {
    component: CompanyLogoPickerCard,
    interaction: 'resume',
    normalize: (props) => {
      if (props.formKind !== 'company_logos') return null;
      const companies = normalizeCompanyLogoChoices(props.options);
      if (!companies.length) return null;
      return {
        title: '选择公司 Logo',
        message:
          typeof props.message === 'string' && props.message.trim()
            ? props.message.trim().slice(0, 160)
            : '每家公司已预选推荐版本，你可以切换或粘贴自定义链接。',
        companies,
        skippable: true,
      };
    },
  },

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
      const fields = def.fromOptions
        ? // 逐项生成的表单（company_logos）：名字来自模型，所以要当不可信输入处理——
          // 去重、去空、限长、封顶条数。一张挂着二十个输入框的卡片是没法填的，而
          // 生成它只需要模型多吐几个名字。
          [
            ...new Set(
              sanitizeOptions(supplied[def.fromOptions])
                .map((option) => option.label.trim())
                .filter(Boolean),
            ),
          ]
            .slice(0, 8)
            .map<WidgetFormField>((name) => ({
              // id 用公司名本身：回传的 `values` 因此天然是「公司 → URL」的映射，
              // 模型不需要再对一次序号。
              id: name,
              label: name,
              kind: 'text',
              // 每一格都可空——用户只有其中两家的图也该能提交。
              optional: true,
              placeholder: 'PNG / JPEG 图片链接',
            }))
        : def.fields.map((field) => {
            if (!field.dynamicOptions) return field;
            const options = sanitizeOptions(supplied[field.id]);
            return options.length
              ? { ...field, options }
              : { ...field, kind: 'text' as const, options: undefined };
          });

      // 一项都没生成出来（模型没给名字/全是空串）就不发这张卡：一张没有输入框的
      // 表单点「提交」等于什么都没说，模型却会当成用户答过了。
      if (def.fromOptions && fields.length === 0) return null;

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

  /**
   * 实时语音面试的入口。`client`：点「进入」就地开浮层，不回传 agent——决定已经做完了，
   * 绕一圈只多一次停顿和一次计费。
   */
  interview_room: {
    component: InterviewRoomCard,
    interaction: 'client',
    normalize: (props) => {
      const role = typeof props.role === 'string' ? props.role.trim() : '';
      // 没有岗位就不是一场能面的面试——降级成文本，比开一个对着空气提问的房间好。
      if (!role) return null;
      const duration = Number(props.durationMinutes);
      const style =
        props.style === 'pressure' || props.style === 'behavioral' ? props.style : 'standard';
      return {
        role,
        ...(typeof props.jobDescription === 'string' && props.jobDescription.trim()
          ? { jobDescription: props.jobDescription }
          : {}),
        durationMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 20,
        style,
      };
    },
  },

  // 纯展示，用户没有要回答的东西——反捏造校验的提示，由引擎推送而非模型调用。
  fabrication_notice: {
    component: FabricationNotice,
    interaction: 'client',
    normalize: (props) => {
      const items = Array.isArray(props.items)
        ? props.items.filter((x): x is string => typeof x === 'string' && Boolean(x.trim()))
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
    normalize: normalizeJobResearchProps,
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

  /**
   * 投递面板。加列 / 算列 / 隐藏列都是**真**动作，所以走 `message` 而不是 `client`：
   * 点一下等于替用户说了那句话，agent 收到后写库再把面板推回来。前端自己不改面板
   * ——否则界面上会出现一列库里没有的东西。
   */
  /**
   * 建面板前先问要盯哪几列。走 request_form 的中断通道，所以结果按默认档（`edit`）
   * 回填到工具参数，不是当成一条用户消息。
   */
  tracker_fields_picker: {
    component: TrackerFieldsCard,
    interaction: 'resume',
    normalize: () => ({}),
  },

  application_tracker: {
    component: ApplicationTrackerCard,
    interaction: 'message',
    normalize: normalizeApplicationTrackerProps,
  },

  ask_choice: {
    component: ChoiceCard,
    interaction: 'resume',
    normalize: (props) => {
      const message = typeof props.message === 'string' ? props.message.trim() : '';
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
      const message = typeof props.message === 'string' ? props.message.trim() : '';
      const options = sanitizeRichOptions(props.options);
      if (!message || options.length < 2) return null;
      const raw = props.recommended;
      const recommended =
        typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < options.length
          ? raw
          : 0;
      return { message, options, recommended };
    },
  },
};

/** 中断分发用：这一次 `ask_choice` 该走推荐卡还是普通选择卡。 */
export function askChoiceKind(args: Record<string, unknown> | undefined): string {
  const options = sanitizeRichOptions(args?.options);
  return hasRecommendation(options, args?.recommended) ? 'ask_choice_recommended' : 'ask_choice';
}

/** `request_form` 里只有 Logo 选择需要专用预览卡，其余仍走通用字段表单。 */
export function requestFormKind(args: Record<string, unknown> | undefined): string {
  if (args?.formKind === 'company_logos') return 'company_logo_picker';
  if (args?.formKind === 'tracker_fields') return 'tracker_fields_picker';
  return 'request_form';
}
