import type { ToolChipRow } from '@magic-resume/genui/beautiful';

/**
 * 工具调用 → `ToolChips` 的行。
 *
 * 此前每次工具调用是一条独立的 `activity` 消息，平铺在时间线里：跑三个工具就是三行
 * 灰字，彼此没有从属关系，也看不出「这一轮总共动了什么」。芯片列表把它们收成一组，
 * 还能展开看每一次的对象。
 *
 * **认不出的工具不编**：图标落到 `run`、动作词回退成工具名本身。宁可显示得朴素，也不
 * 假装我们知道它在做什么。
 */

/** 工具名 → 芯片图标键。`Icons` 只有 think / write / run / read 四个。 */
const TOOL_ICON: Record<string, string> = {
  read_resume: 'read',
  write_resume: 'write',
  edit_file: 'write',
  write_file: 'write',
  read_file: 'read',
  analyze_resume: 'think',
  evaluate_fit: 'think',
  web_search: 'read',
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
export interface ToolCallSummary {
  kind?: string;
  count?: number;
  name?: string;
}

export interface ToolCallRecord {
  toolCallId: string;
  toolName: string;
  /** 这次调用作用在什么上——文件名、简历模块、查询词。 */
  subject?: string;
  done?: boolean;
  summary?: ToolCallSummary;
}

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
      // 路径只留文件名：`/workspace/resume.json` 在芯片里显示成 `resume.json`。
      return v.split('/').filter(Boolean).pop() ?? v;
    }
  }
  return undefined;
}

export function toToolChipRows(
  calls: ToolCallRecord[],
  t: (key: string, options?: Record<string, unknown>) => string,
): ToolChipRow[] {
  return calls.map((call) => {
    const verb = TOOL_VERB[call.toolName];
    const line = summaryLine(call.summary, t);
    return {
      icon: TOOL_ICON[call.toolName] ?? 'run',
      label: verb
        ? t(`aiLab.tools.${verb}`, { defaultValue: call.toolName })
        : call.toolName,
      chip: call.subject ?? '',
      mono: !verb,
      // 没有摘要就给空数组：ToolChips 靠它决定这一行能不能展开，
      // 塞一条占位行会让箭头点开一片空白。
      detail: line ? [{ text: line }] : [],
    };
  });
}
