import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeSharingStore = Pick<
  ResumeState,
  'activeResume' | 'updateSharing' | 'saveResume' | 'syncStatus'
>;

export const useResumeSharingStore =
  createResumeDomainStore<ResumeSharingStore>((state) => ({
    activeResume: state.activeResume,
    updateSharing: state.updateSharing,
    saveResume: state.saveResume,
    syncStatus: state.syncStatus,
  }));
