/**
 * 输入框的「模式」——与技能正交的一根轴。
 *
 * 技能回答「做什么事」（优化 / 分析 / 翻译…），模式回答「AI 与你的简历是什么关系」：
 * 能不能直接改、要不要读。任何技能都能在任一模式下跑。
 *
 * 关键：这三档**不是靠提示词祈祷**。后端的 `mode` 是与技能绑死的闭集塞不进新维度，
 * 但三档里最硬的约束前端本来就攥着——`resumeId` 发不发、`read_resume` 的审批裁决、
 * `resume_update` 事件消费不消费。`contract` 只是让模型主动配合，真正的闸门在
 * AiChatShell 的 `consumeStream` 与 `scopedResumeId` 里，读 `allowsResumeEdits` /
 * `allowsResumeRead` 两个开关。所以模式不需要后端改动就能确定性生效。
 */
export type AgentMode = 'cocreate' | 'plan' | 'ask';

export const AGENT_MODE_LIST: AgentMode[] = ['cocreate', 'plan', 'ask'];

export const DEFAULT_AGENT_MODE: AgentMode = 'cocreate';

/** 点阵带的每模式形态。三档共用 sky 色相，靠排布/形状/流动区分——见下方说明。 */
export interface ModeDotStyle {
  /** [列间距, 行间距]，px */
  spacing: [number, number];
  rgb: [number, number, number];
  /** 圆点 + 奇数行半格错位（规划：像在铺格子） */
  stagger: boolean;
  /** 横向缓慢流动（问答：像信号在流过，AI 在旁边待命） */
  flow: boolean;
}

export interface AgentModeMeta {
  id: AgentMode;
  /** 模式条文字、胶囊、glyph 的取色 */
  accentHex: string;
  dots: ModeDotStyle;
  /**
   * 随每轮以 `role: 'system'` 发出的契约。前端闸门已经硬性挡住了越界行为，
   * 这条是让模型的**表达**也对齐——否则它会一边被挡一边说"我已经改好了"。
   */
  contract: string | null;
  /** 这一档是否允许 AI 产出简历改动 */
  allowsResumeEdits: boolean;
  /** 这一档是否允许 AI 读取简历 */
  allowsResumeRead: boolean;
}

/**
 * 配色刻意不照搬 demo 的「蓝 / 青 / 绿」三色相。
 *
 * 项目里 sky 是唯一强调色，而六个技能已经把冷色区占满了（sky / violet / emerald /
 * cyan / amber / rose）——再给模式发三个色相，必然和同屏的技能胶囊撞车。
 * 这里改成：**共创与规划共用 sky，靠点阵形态区分**（demo 本身就给三个模式配了不同
 * 的点阵排布，这个巧思保留）；只有「问答」用中性灰蓝——它是唯一不碰简历的一档，
 * 「AI 退到一边」这件事由颜色本身说出来，比再发一个强调色更准确。
 */
export const AGENT_MODES: Record<AgentMode, AgentModeMeta> = {
  cocreate: {
    id: 'cocreate',
    accentHex: '#38bdf8',
    dots: { spacing: [5, 5], rgb: [56, 189, 248], stagger: false, flow: false },
    // 默认档 = 现状行为，不需要额外约束。多一条 system 消息只会挤占上下文。
    contract: null,
    allowsResumeEdits: true,
    allowsResumeRead: true,
  },
  plan: {
    id: 'plan',
    accentHex: '#38bdf8',
    dots: { spacing: [7, 6], rgb: [56, 189, 248], stagger: true, flow: false },
    contract:
      '当前处于「规划」模式：只给方案、建议和取舍分析，不要产出任何简历改动。' +
      '需要动笔的地方，说明改哪里、怎么改、为什么，让用户自己决定是否执行。' +
      '不要声称你已经修改了简历——你在这一模式下没有写入权限。',
    allowsResumeEdits: false,
    allowsResumeRead: true,
  },
  ask: {
    id: 'ask',
    accentHex: '#94a3b8',
    dots: { spacing: [9, 5], rgb: [148, 163, 184], stagger: false, flow: true },
    contract:
      '当前处于「问答」模式：只回答问题，不读取用户简历、也不产出任何简历改动。' +
      '如果问题必须看过简历才能回答，直说需要切换到其它模式，不要猜测简历内容。',
    allowsResumeEdits: false,
    allowsResumeRead: false,
  },
};

/**
 * 每个技能对简历的最小需求。用来在当前模式下过滤 `/` 菜单——不然「问答」模式下
 * 点「简历分析」会拿不到 resumeId 直接跑失败，用户看到的是"坏了"而不是"这不该在这儿"。
 *
 * 过滤下来的结果本身也解释了三个模式：
 *   共创 → 六个技能全在；规划 → 只剩只读的分析类；问答 → 一个都没有，就是纯聊天。
 */
export const SKILL_RESUME_NEEDS: Record<
  'create' | 'optimize' | 'analyze' | 'fit' | 'translate' | 'interview',
  { read: boolean; write: boolean }
> = {
  create: { read: false, write: true },
  optimize: { read: true, write: true },
  analyze: { read: true, write: false },
  fit: { read: true, write: false },
  translate: { read: true, write: true },
  interview: { read: true, write: false },
};

export function isSkillAvailableInMode(
  skillId: keyof typeof SKILL_RESUME_NEEDS,
  mode: AgentMode
): boolean {
  const needs = SKILL_RESUME_NEEDS[skillId];
  const meta = AGENT_MODES[mode];
  if (!needs) return true;
  if (needs.read && !meta.allowsResumeRead) return false;
  if (needs.write && !meta.allowsResumeEdits) return false;
  return true;
}

/** i18n key 前缀——名称与说明走翻译文件，不写死在注册表里。 */
export const modeNameKey = (id: AgentMode) => `aiLab.mode.${id}.name`;
export const modeReadyKey = (id: AgentMode) => `aiLab.mode.${id}.ready`;
export const modeLoadingKey = (id: AgentMode) => `aiLab.mode.${id}.loading`;
export const modeHintKey = (id: AgentMode) => `aiLab.mode.${id}.hint`;
export const modePlaceholderKey = (id: AgentMode) => `aiLab.mode.${id}.placeholder`;
