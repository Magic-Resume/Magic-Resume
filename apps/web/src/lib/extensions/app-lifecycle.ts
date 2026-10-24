import type { FileSizeBucket } from '@/lib/utils/fileSize';

export type ResumeImportCompletedPayload = {
  source: 'json';
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
  reactErrorCaught: (payload: ReactErrorPayload) => {
    ignore(payload);
  },
};

export type AppLifecycle = typeof appLifecycle;
