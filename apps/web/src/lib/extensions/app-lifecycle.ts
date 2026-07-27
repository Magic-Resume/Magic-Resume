import type { FileSizeBucket } from '@/lib/utils/fileSize';

export type GithubStarLocation =
  | 'footer'
  | 'hero'
  | 'hero_glass_button'
  | 'hero_macbook_badge'
  | 'footer_mobile';

export type ResumeImportSource = 'json' | 'pdf';

export type ResumeImportCompletedPayload = {
  source: ResumeImportSource;
  cloudSyncEnabled: boolean;
  sizeBucket?: FileSizeBucket;
};

export type DashboardViewedPayload = {
  resumeCount: number;
};

export type EditorViewedPayload = {
  templateId?: string;
};

export type ResumeSaveRequestedPayload = {
  source: 'manual' | 'auto';
};

export type ResumeJsonDownloadedPayload = {
  source: 'editor' | 'json_page' | 'json_modal';
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

export const appLifecycle = {
  getStartedClicked: noop,
  githubStarClicked: (location: GithubStarLocation) => {
    ignore(location);
  },
  dashboardViewed: (payload: DashboardViewedPayload) => {
    ignore(payload);
  },
  resumeCreateRequested: noop,
  resumeCreated: noop,
  resumeImportRequested: noop,
  resumeImportCompleted: (payload: ResumeImportCompletedPayload) => {
    ignore(payload);
  },
  editorViewed: (payload: EditorViewedPayload) => {
    ignore(payload);
  },
  resumeSaveRequested: (payload: ResumeSaveRequestedPayload) => {
    ignore(payload);
  },
  resumeJsonDownloaded: (payload: ResumeJsonDownloadedPayload) => {
    ignore(payload);
  },
  resumeTemplateSelected: (payload: ResumeTemplateSelectedPayload) => {
    ignore(payload);
  },
  settingsViewed: noop,
  settingsSaved: (payload: LifecyclePayload) => {
    ignore(payload);
  },
  aiCreateViewed: noop,
  aiOptimizeViewed: noop,
  aiAnalyzeViewed: noop,
  aiInterviewViewed: noop,
  aiOptimizationStarted: (hasInputContext: boolean) => {
    ignore(hasInputContext);
  },
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
  shareLinkCopied: noop,
  sharedResumeViewed: noop,
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
};

export type AppLifecycle = typeof appLifecycle;
