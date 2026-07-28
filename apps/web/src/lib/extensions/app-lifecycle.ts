import type { FileSizeBucket } from '@/lib/utils/fileSize';

export type ResumeImportSource = 'json' | 'pdf';

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
