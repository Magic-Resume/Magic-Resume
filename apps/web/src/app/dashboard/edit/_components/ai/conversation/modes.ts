import { Bot, MessageCircleQuestion, Route, type LucideIcon } from '@magic-resume/icons';

/**
 * 输入框的「模式」——与技能正交的一根轴。
 *
 * 技能回答「做什么事」（优化 / 分析 / 翻译…），模式回答「AI 与你的简历是什么关系」：
 * 能不能直接改、要不要读。任何技能都能在任一模式下跑。
 *
 * 关键：这三档**不是靠提示词祈祷**。最硬的约束前端自己攥着——`resumeId` 发不发、
 * `read_resume` 的审批裁决、`resume_update` 事件消费不消费，即下面的
 * `allowsResumeEdits` / `allowsResumeRead` 两个开关（落在 AiChatShell 的
 * `consumeStream` 与 `scopedResumeId`）。
 *
 * 让模型**知道**自己在哪一档，是另一条路：随每轮发 `agentMode` 枚举，契约文本由
 * 服务端持有。此处一度自带一份 `contract` 随消息以 `role:'system'` 发出，那条从没
 * 到过模型——会话带线程 id 时服务端每轮只取最后一条 user 消息，system 被整条丢弃。
 */
export type AgentMode = 'cocreate' | 'plan' | 'ask';

export const AGENT_MODE_LIST: AgentMode[] = ['cocreate', 'plan', 'ask'];

export const DEFAULT_AGENT_MODE: AgentMode = 'cocreate';

/** 点阵带的每模式形态。 */
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
  /** 模式条文字、胶囊、菜单项、glyph 的取色 */
  accentHex: string;
  /** 菜单项与胶囊上的图元。三档一眼可辨，不用读字。 */
  icon: LucideIcon;
  dots: ModeDotStyle;
  /** 这一档是否允许 AI 产出简历改动 */
  allowsResumeEdits: boolean;
  /** 这一档是否允许 AI 读取简历 */
  allowsResumeRead: boolean;
}

/**
 * 三档一色一形。
 *
 * 色相要绕开六个技能已占的 sky / violet / emerald / cyan / amber / rose——同屏可能
 * 并存，撞色就分不清「在跑什么」和「AI 能不能动我的简历」。所以规划取 indigo：
 * 与 optimize 的 violet 同族但明显更蓝，和 sky 也拉得开。
 *
 * 语义上三色是一条**递减的介入度**：sky（动手写）→ indigo（只谋划）→ slate（退到
 * 一边）。饱和度一路降下来，颜色本身就说清了 AI 离你的简历有多远。
 */
export const AGENT_MODES: Record<AgentMode, AgentModeMeta> = {
  cocreate: {
    id: 'cocreate',
    accentHex: '#38bdf8',
    // 共创由 AI 主动参与：机器人标识强调 AI 助手，而不是泛泛的多人协作。
    icon: Bot,
    dots: { spacing: [5, 5], rgb: [56, 189, 248], stagger: false, flow: false },
    allowsResumeEdits: true,
    allowsResumeRead: true,
  },
  plan: {
    id: 'plan',
    accentHex: '#818cf8',
    // 给路线不走路。
    icon: Route,
    dots: { spacing: [7, 6], rgb: [129, 140, 248], stagger: true, flow: false },
    allowsResumeEdits: false,
    allowsResumeRead: true,
  },
  ask: {
    id: 'ask',
    accentHex: '#94a3b8',
    // 纯问答，连简历都不读。
    icon: MessageCircleQuestion,
    dots: { spacing: [9, 5], rgb: [148, 163, 184], stagger: false, flow: true },
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
