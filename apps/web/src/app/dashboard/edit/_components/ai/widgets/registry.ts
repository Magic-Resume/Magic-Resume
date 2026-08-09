import { ChoiceCard, FormCard } from '@magic-resume/genui';
import TemplateGalleryCard from './TemplateGalleryCard';
import FabricationNotice from './FabricationNotice';
import JobResearchCard from './JobResearchCard';
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
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WidgetOption[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const label = item.trim().slice(0, MAX_OPTION_LABEL);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ value: label, label });
    if (out.length >= MAX_MODEL_OPTIONS) break;
  }
  return out;
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
      { id: 'jd', label: '目标 JD', kind: 'textarea', placeholder: '粘贴目标职位描述，AI 将据此定向优化…' },
      { id: 'company', label: '公司', kind: 'search', source: 'companies', optional: true, placeholder: '例如 字节跳动' },
      { id: 'title', label: '岗位', kind: 'search', source: 'roles', optional: true, placeholder: '例如 高级产品经理' },
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
          '前端开发', '后端开发', '移动端', '算法/AI', '数据分析', '测试',
          '运维/SRE', '产品经理', '运营', 'UI/UX 设计', '市场', '人力/行政',
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
          '教育经历', '实习经历', '全职工作', '项目经历',
          '竞赛获奖', '开源贡献', '论文/专利', '证书', '社团/组织',
        ),
      },
    ],
  },

  create_education: {
    title: '教育经历',
    skippable: true,
    fields: [
      { id: 'school', label: '学校', kind: 'search', source: 'schools', placeholder: '搜索或直接输入' },
      { id: 'degree', label: '学历', kind: 'chips', options: opts('大专', '本科', '硕士', '博士') },
      { id: 'major', label: '专业', kind: 'search', source: 'majors', optional: true, placeholder: '搜索或直接输入' },
      { id: 'date', label: '起止时间', kind: 'month-range', optional: true },
    ],
  },

  create_experience: {
    title: '工作/实习经历',
    skippable: true,
    fields: [
      { id: 'company', label: '公司', kind: 'search', source: 'companies', placeholder: '搜索或直接输入' },
      { id: 'position', label: '岗位', kind: 'search', source: 'roles', placeholder: '搜索或直接输入' },
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
      { id: 'name', label: '项目名称', kind: 'text', placeholder: '例如 内部数据看板' },
      { id: 'role', label: '你的角色', kind: 'text', optional: true, placeholder: '例如 主力开发' },
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
};
