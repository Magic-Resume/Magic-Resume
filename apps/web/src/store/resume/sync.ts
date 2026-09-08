import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeSyncStore = Pick<
  ResumeState,
  | 'activeResume'
  | 'syncStatus'
  | 'isSyncing'
  | 'syncToCloud'
  | 'fetchCloudResume'
  | 'refreshCloudVersions'
  | 'flushSyncOnExit'
>;

export const useResumeSyncStore = createResumeDomainStore<ResumeSyncStore>(
  (state) => ({
    activeResume: state.activeResume,
    syncStatus: state.syncStatus,
    isSyncing: state.isSyncing,
    syncToCloud: state.syncToCloud,
    fetchCloudResume: state.fetchCloudResume,
    refreshCloudVersions: state.refreshCloudVersions,
    flushSyncOnExit: state.flushSyncOnExit,
  }),
);
