/**
 * Agent 此刻在干什么。
 *
 * **不需要让 agent 额外上报**——后端定义了 31 种 SSE 事件，前端此前只消费 15 种，
 * 其中 `tool_started` 还写死只认 `read_resume`，其余工具（analyze_resume /
 * evaluate_fit / ask_choice / request_form / push_ui …）全部静默丢弃。所以「看不出
 * agent 在干什么」的根因是前端把上报扔了，不是缺少通道。
 *
 * 这里只保留**有真实事件支撑**的状态。不做「猜一个看起来更丰富的状态」——项目刚
 * 删过一批模拟并未发生之工作的假动效，再引入一次就是走回头路。
 */
export type AgentActivity =
  /** 已开始生成、但首个 token 还没到 */
  | 'thinking'
  /** 正在读取用户的简历 */
  | 'reading'
  /** 正在跑分析 / 匹配这类要出报告的工具 */
  | 'analyzing'
  /** 在跑别的工具——知道有工具在跑，但不必逐个起名 */
  | 'working'
  /** 一个子代理正在工作 */
  | 'subagent'
  /** 正在往外写字 */
  | 'writing'
  /** 停下来等用户回应（审批 / 表单 / 选项卡） */
  | 'awaiting';

/**
 * 工具名 → 活动。表里没有的工具落到 `working`：我们确实知道「有工具在跑」，
 * 只是不必给每个工具单独造一种形态。
 */
const TOOL_ACTIVITY: Record<string, AgentActivity> = {
  read_resume: 'reading',
  analyze_resume: 'analyzing',
  evaluate_fit: 'analyzing',
};

export function activityForTool(toolName: string | undefined): AgentActivity {
  if (!toolName) return 'working';
  return TOOL_ACTIVITY[toolName] ?? 'working';
}

/**
 * 活动 → thinking-orbs 的形态名。
 *
 * 刻意只用到库里九种中的六种：`connecting` / `weaving` / `shaping` 没有能对应它们
 * 的真实事件，硬套就又成了演一个并没有发生的状态。
 */
export const ORB_STATE: Record<AgentActivity, string> = {
  thinking: 'breathing',
  reading: 'searching',
  analyzing: 'solving',
  working: 'working',
  subagent: 'working',
  writing: 'composing',
  awaiting: 'listening',
};

/** 旁白文案的 i18n key。 */
export const activityLabelKey = (a: AgentActivity) => `aiLab.activity.${a}`;
