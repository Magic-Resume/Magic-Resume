import type { ToolChipRow } from '@magic-resume/genui/beautiful';

/**
 * 工具调用 → `ToolChips` 的行。
 *
 * **认不出的工具不编**，但也不许漏底：见 `describeToolCall`。下面两张表只服务老工具与
 * 老的持久化消息——新工具应当由后端在 `tool_result.summary` 里自带 `kind`/`verb`，
 * 而不是再往这里加一行（加的人和写工具的人不在同一个仓，漏了还不报错）。
 */

/** 工具名 → 芯片图标键，见 `genui/beautiful/icons.tsx`。 */
const TOOL_ICON: Record<string, string> = {
  read_resume: 'read',
  write_resume: 'write',
  edit_file: 'edit',
  write_file: 'write',
  read_file: 'read',
  analyze_resume: 'analyze',
  evaluate_fit: 'analyze',
  web_search: 'search',
  ask_choice: 'ask',
  request_form: 'ask',
  push_ui: 'tool',
};

/** 工具名 → 动作词的 i18n key 后缀。表里没有的直接用工具名。 */
const TOOL_VERB: Record<string, string> = {
  read_resume: 'read',
  write_resume: 'write',
  edit_file: 'edit',
  write_file: 'write',
  read_file: 'read',
  analyze_resume: 'analyze',
  evaluate_fit: 'evaluate',
  web_search: 'search',
};

/**
 * 后端 `tool_result.summary`：**结构，不是文案**。
 *
 * 措辞在这一层才定下来，所以中英文界面各说各的话；后端只说「读到 4 个模块」这件事本身。
 */
import type { ToolCall, ToolCallSummary } from '../types';

/** 形状归 `types.ts`（消息模型的家）。这里只是历史调用点用惯了的别名。 */
export type { ToolCallSummary };
export type ToolCallRecord = ToolCall;

/** 认得的 summary 形状；认不出就不出明细行，不猜。 */
function summaryLine(
  summary: ToolCallSummary | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | undefined {
  if (!summary?.kind) return undefined;
  if (summary.kind === 'file') return summary.name || undefined;
  if (typeof summary.count !== 'number') return undefined;
  if (summary.kind === 'sections')
    return t('aiLab.tools.summary.sections', { count: summary.count });
  if (summary.kind === 'results')
    return t('aiLab.tools.summary.results', { count: summary.count });
  return undefined;
}

/**
 * 从工具调用的入参里取出「作用对象」。
 *
 * 只认几个确定的键，取不到就不显示 —— 把整个 args 序列化塞进芯片会泄漏简历正文，
 * 而芯片是给人一眼扫过去的，不是日志。
 */
export function subjectOf(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined;
  const a = args as Record<string, unknown>;
  for (const key of ['file_path', 'path', 'query', 'section', 'target']) {
    const v = a[key];
    if (typeof v === 'string' && v.trim()) {
      // 技能文件取技能名而不是文件名：一屏的 `SKILL.md` 长得一模一样，对求职者也
      // 没有任何信息量——他关心的是「在用哪个技能」。
      const skill = v.match(/\/skills\/([^/]+)\//i);
      if (skill) return skill[1];
      // 其余路径只留文件名：`/workspace/resume.json` 在芯片里显示成 `resume.json`。
      return v.split('/').filter(Boolean).pop() ?? v;
    }
  }
  return undefined;
}

/**
 * 能安全画出来的图标键。**必须和 `genui/beautiful/icons.tsx` 的 `IconKey` 对齐**——
 * 这里少一个，后端指过来的图标就静默退成扳手。
 *
 * `run`（终端箭头）刻意仍在其中但只给 `execute` 用：把它当兜底会让一个求职工具带上
 * 开发者终端的观感。
 */
const KNOWN_ICONS = new Set([
  'read',
  'write',
  'edit',
  'analyze',
  'search',
  'ask',
  'tool',
  'run',
  'plan',
  'delegate',
  'track',
  'interview',
  'design',
  'logo',
  'verify',
  'card',
  'archive',
]);

/**
 * 后端 `TOOL_DISPLAY` 会用到的全部动词。i18n 必须每个都有 `aiLab.tools.<verb>`。
 *
 * 这份清单是**跨仓契约的本地副本**：真正的源头在 Core 的
 * `engine/tools/named-tool.ts`，而那份表和这里的 i18n 不在同一个仓，
 * **没有任何测试能同时看到两边**。所以这里做两件事：单测钉住「清单里的词都有译文」，
 * 加上下面 `describeToolCall` 里的开发态告警兜住「Core 加了新词但没同步过来」。
 */
export const AGENT_TOOL_VERBS = [
  'read',
  'write',
  'edit',
  'browse',
  'search',
  'plan',
  'delegate',
  'run',
  'logo',
  'analyze',
  'evaluate',
  'track',
  'design',
  'interview',
  'verify',
  'ask',
  'show',
  'explain',
] as const;

/** 已经报过的工具名，同一个不刷屏。 */
const warnedTools = new Set<string>();

/**
 * 一次调用在界面上叫什么、画什么图标。
 *
 * 取值顺序：**后端给的展示结构** → 前端的工具名表（老工具、老持久化消息）→ 泛化兜底。
 *
 * 兜底**绝不回退成工具名**。此前它会，于是 `track_application` 带着一个 `>_` 终端图标
 * 出现在求职者的对话里——工具是后端加的、文案表在前端，谁也不会因为漏了一条而看到报错，
 * 只有截图会告诉你。朴素可以，朴素成开发者词汇不行。
 */
function describeToolCall(
  call: ToolCallRecord,
  t: (key: string, options?: Record<string, unknown>) => string,
): { icon: string; label: string; mono: boolean } {
  const verb = call.summary?.verb ?? TOOL_VERB[call.toolName];
  const iconKey = call.summary?.icon ?? TOOL_ICON[call.toolName];
  const icon = iconKey && KNOWN_ICONS.has(iconKey) ? iconKey : 'tool';
  // 认不认这个词，直接问 i18n —— 而不是再维护一份 verb 白名单。
  //
  // 之前这里有个 `KNOWN_VERBS` 集合，于是「加一个工具」要同时改后端 TOOL_DISPLAY、
  // 前端白名单、i18n 三处；漏了中间那处就静默退成「处理」。`start_interview` 上线
  // 第一天就是这么退的。少一份表，就少一处能漏的地方，而 i18n 那份本来就非有不可
  // （`i18n:check` 还会替我们守着）。
  const label = verb ? t(`aiLab.tools.${verb}`, { defaultValue: '' }) : '';
  if (!label && process.env.NODE_ENV === 'development' && !warnedTools.has(call.toolName)) {
    // 兜底本身是对的（朴素好过开发者词汇），但**静默**地兜是错的：漏一条没人会看到
    // 报错，只有截图会告诉你。开发态说一声，加的人当场就知道该补哪里。
    warnedTools.add(call.toolName);
    console.warn(
      `[toolTrace] "${call.toolName}" 退回了兜底文案。` +
        (verb
          ? `缺 i18n 键 aiLab.tools.${verb}（zh + en 都要补，并加进 AGENT_TOOL_VERBS）。`
          : '它在 Core 的 TOOL_DISPLAY 里没有条目，去 engine/tools/named-tool.ts 补 verb + icon。'),
    );
  }
  return { icon, label: label || t('aiLab.tools.fallback'), mono: false };
}

export function toToolChipRows(
  calls: ToolCallRecord[],
  t: (key: string, options?: Record<string, unknown>) => string,
): ToolChipRow[] {
  return calls.map((call) => {
    const { icon, label, mono } = describeToolCall(call, t);
    const line = summaryLine(call.summary, t);
    return {
      id: call.toolCallId,
      icon,
      label,
      // 后端给的 subject 优先：它知道「投递面板」，前端只能从 args 里猜出一个路径片段。
      chip: call.summary?.subject ?? call.subject ?? '',
      mono,
      // 没有摘要就给空数组：ToolChips 靠它决定这一行能不能展开，
      // 塞一条占位行会让箭头点开一片空白。
      detail: line ? [{ text: line }] : [],
    };
  });
}
