import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeVersionsStore = Pick<
  ResumeState,
  | 'activeResume'
  | 'createVersion'
  | 'restoreVersion'
  | 'deleteVersion'
  | 'refreshCloudVersions'
>;

export const useResumeVersionsStore =
  createResumeDomainStore<ResumeVersionsStore>((state) => ({
    activeResume: state.activeResume,
    createVersion: state.createVersion,
    restoreVersion: state.restoreVersion,
    deleteVersion: state.deleteVersion,
    refreshCloudVersions: state.refreshCloudVersions,
  }));
