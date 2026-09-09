import type { FileSizeBucket } from '@/lib/utils/fileSize';

/**
 * 导入来源。四种走 LLM 解析的格式各占一个值，而不是并成一个 'document'——
 * 「Word 用户占多少」和「有多少人是直接传截图的」是两个会导向不同产品决策的问题，
 * 合并之后就再也分不出来了。
 *
 * 'pdf' 与 'json' 是既有值，语义未变：只增不改，历史指标不会从中间断掉。
 */
export type ResumeImportSource = 'json' | 'pdf' | 'image' | 'docx' | 'markdown';

export type ResumeImportCompletedPayload = {
  source: ResumeImportSource;
  cloudSyncEnabled: boolean;
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

type LifecyclePayload = Record<string, unknown>;

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
 * Seam the commercial overlay implements. Anything a *marker* covers is absent
 * here on purpose: a `data-magic-*` attribute plus a line of tracking manifest
 * already reports it, and routing it through this object as well would double
 * count. Page-level impressions (dashboard, editor, settings, a shared resume)
 * are all markers now.
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
  settingsSaved: (payload: LifecyclePayload) => {
    ignore(payload);
  },
  aiOptimizationStarted: noop,
  aiOptimizationApplied: (payload: LifecyclePayload) => {
    ignore(payload);
  },
  aiAnalysisStarted: noop,
  aiAnalysisSucceeded: noop,
  aiOptimizationFailed: (payload: AiFailurePayload = {}) => {
    ignore(payload);
  },
  aiAnalysisFailed: (payload: AiFailurePayload = {}) => {
    ignore(payload);
  },
  /**
   * 一次简历改动没能到达画布。这是 agent 可靠性的核心指标——这类失败此前在整条链路上
   * 一句提示都没有，我们这边一个数都没有，只能等用户来报。
   */
  aiChangesDropped: (payload: AiChangesDroppedPayload) => {
    ignore(payload);
  },
  /** 服务端断言：一整轮试过改简历、一次都没成功。与上面是「没送达」和「没产出」之分。 */
  aiWriteFailed: (payload: { attempts?: number } = {}) => {
    ignore(payload);
  },
  aiCreateStarted: noop,
  aiCreateCompleted: noop,
  aiInterviewStarted: noop,
  aiInterviewEnded: (payload: { durationSec?: number } = {}) => {
    ignore(payload);
  },
  aiJdUploaded: (payload: { sizeBucket?: FileSizeBucket } = {}) => {
    ignore(payload);
  },
  resumeExported: (payload: ResumeExportedPayload) => {
    ignore(payload);
  },
  shareLinkCreated: noop,
  editorSectionAdded: (payload: EditorSectionPayload) => {
    ignore(payload);
  },
  editorSectionRemoved: (payload: EditorSectionPayload) => {
    ignore(payload);
  },
  editorSectionReordered: noop,
  settingsCloudSyncToggled: (payload: { enabled: boolean }) => {
    ignore(payload);
  },
  settingsApiKeyConfigured: (payload: { provider?: string } = {}) => {
    ignore(payload);
  },
  settingsMcpTokenGenerated: noop,
  identifyUser: (userId: string | null | undefined) => {
    ignore(userId);
  },
  configureAnalyticsAuth: (getter: () => Promise<string | null>) => {
    ignore(getter);
  },
  reportApiError: (error: unknown) => {
    ignore(error);
  },
  reactErrorCaught: (payload: ReactErrorPayload) => {
    ignore(payload);
  },
};

export type AppLifecycle = typeof appLifecycle;
