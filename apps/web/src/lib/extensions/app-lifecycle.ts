import type { FileSizeBucket } from '@/lib/utils/fileSize';

/** JSON is read in the browser; the others are parsed by the AI backend. */
export type ResumeImportSource = 'json' | 'pdf' | 'image' | 'docx' | 'markdown';

export type ResumeImportCompletedPayload = {
  source: ResumeImportSource;
  sizeBucket?: FileSizeBucket;
};

export type ResumeSaveRequestedPayload = {
  source: 'manual' | 'auto';
};

/** A render-time crash caught by a React error boundary. */
export type ReactErrorPayload = {
  message: string;
  name?: string;
  stack?: string;
  /** Next's digest id for a server-side exception. */
  digest?: string;
  /** Which boundary caught it, e.g. `app/dashboard`. */
  component?: string;
};

export type ResumeTemplateSelectedPayload = {
  previousTemplateId?: string;
  nextTemplateId: string;
};

export type ResumeExportFormat = 'pdf' | 'docx' | 'json' | 'png';

export type ResumeExportedPayload = {
  format: ResumeExportFormat;
  source?: string;
  success?: boolean;
  durationMs?: number;
};

/** Coarse reason only — never a provider message, which can echo user text. */
export type AiFailurePayload = {
  reason?: 'timeout' | 'rate_limited' | 'quota' | 'content_filter' | 'upstream' | 'unknown';
  status?: number;
};

/**
 * agent 产出了一次简历改动，但它没能到达画布——被哪一层拦下的。
 *
 * 只带枚举原因和条数，绝不带简历内容：这是可靠性指标，不是内容日志。
 */
export type AiChangesDroppedPayload = {
  reason:
    /** 「规划 / 问答」档位不允许改简历，事件被丢弃。 */
    | 'mode_readonly'
    /** 载荷读不懂（缺 sections、结构对不上）。 */
    | 'malformed'
    /** 条目 id 在现有简历里找不到——agent 重建了 id 就会这样。 */
    | 'unmatched_items'
    /** diff 跑完一条可评审的改动都没有。 */
    | 'no_changes'
    /** 当前模板上没有这个字段的落点，卡片无处渲染。 */
    | 'no_anchor'
    /** 用户点了接受，但写不进简历。 */
    | 'apply_failed';
  /** 这次丢掉了几处改动；说不出具体条数时省略。 */
  count?: number;
};

export type EditorSectionPayload = {
  /** Section kind (`experience`, `education`, …), never its contents. */
  section: string;
};

const noop = () => undefined;
const ignore = <T,>(value: T) => {
  void value;
};

/**
 * Lifecycle hooks the app calls at the moments worth measuring. Every hook is
 * a no-op here; a self-hosted deployment that wants analytics or error
 * reporting replaces the bodies. Payloads carry enums and counts only, never
 * resume content.
 */
export const appLifecycle = {
  resumeCreated: noop,
  resumeImportCompleted: (payload: ResumeImportCompletedPayload) => {
    ignore(payload);
  },
  resumeSaveRequested: (payload: ResumeSaveRequestedPayload) => {
    ignore(payload);
  },
  resumeTemplateSelected: (payload: ResumeTemplateSelectedPayload) => {
    ignore(payload);
  },
  resumeExported: (payload: ResumeExportedPayload) => {
    ignore(payload);
  },
  editorSectionAdded: (payload: EditorSectionPayload) => {
    ignore(payload);
  },
  editorSectionRemoved: (payload: EditorSectionPayload) => {
    ignore(payload);
  },
  editorSectionReordered: noop,
  aiOptimizationStarted: noop,
  aiOptimizationApplied: (payload: Record<string, unknown>) => {
    ignore(payload);
  },
  aiOptimizationFailed: (payload: AiFailurePayload = {}) => {
    ignore(payload);
  },
  aiAnalysisStarted: noop,
  aiAnalysisSucceeded: noop,
  aiAnalysisFailed: (payload: AiFailurePayload = {}) => {
    ignore(payload);
  },
  aiCreateStarted: noop,
  aiCreateCompleted: noop,
  aiJdUploaded: (payload: { sizeBucket?: FileSizeBucket } = {}) => {
    ignore(payload);
  },
  /** 一次简历改动没能到达画布。agent 可靠性的核心指标。 */
  aiChangesDropped: (payload: AiChangesDroppedPayload) => {
    ignore(payload);
  },
  /** 服务端断言：一整轮试过改简历、一次都没成功。与上面是「没送达」和「没产出」之分。 */
  aiWriteFailed: (payload: { attempts?: number } = {}) => {
    ignore(payload);
  },
  reactErrorCaught: (payload: ReactErrorPayload) => {
    ignore(payload);
  },
};

export type AppLifecycle = typeof appLifecycle;
