import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumePersistenceStore = Pick<
  ResumeState,
  'loadResumes' | 'addResume' | 'saveResume' | 'flushSyncOnExit'
>;

export const useResumePersistenceStore =
  createResumeDomainStore<ResumePersistenceStore>((state) => ({
    loadResumes: state.loadResumes,
    addResume: state.addResume,
    saveResume: state.saveResume,
    flushSyncOnExit: state.flushSyncOnExit,
  }));
