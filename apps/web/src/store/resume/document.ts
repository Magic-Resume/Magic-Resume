import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeDocumentStore = Pick<
  ResumeState,
  | 'resumes'
  | 'activeResume'
  | 'isStoreLoading'
  | 'loadResumes'
  | 'createResume'
  | 'importResume'
  | 'addResume'
  | 'updateResume'
  | 'duplicateResume'
  | 'renameResume'
  | 'deleteResume'
  | 'loadResumeForEdit'
  | 'updateInfo'
  | 'setSectionOrder'
  | 'updateSectionItems'
  | 'addCustomSection'
  | 'updateCustomSection'
  | 'removeCustomSection'
  | 'updateSections'
  | 'updateTemplate'
  | 'updateCustomTemplate'
  | 'updateThemeColor'
  | 'updateTypography'
  | 'applyFullResume'
  | 'applyWorkspaceResolution'
>;

export const useResumeDocumentStore =
  createResumeDomainStore<ResumeDocumentStore>((state) => ({
    resumes: state.resumes,
    activeResume: state.activeResume,
    isStoreLoading: state.isStoreLoading,
    loadResumes: state.loadResumes,
    createResume: state.createResume,
    importResume: state.importResume,
    addResume: state.addResume,
    updateResume: state.updateResume,
    duplicateResume: state.duplicateResume,
    renameResume: state.renameResume,
    deleteResume: state.deleteResume,
    loadResumeForEdit: state.loadResumeForEdit,
    updateInfo: state.updateInfo,
    setSectionOrder: state.setSectionOrder,
    updateSectionItems: state.updateSectionItems,
    addCustomSection: state.addCustomSection,
    updateCustomSection: state.updateCustomSection,
    removeCustomSection: state.removeCustomSection,
    updateSections: state.updateSections,
    updateTemplate: state.updateTemplate,
    updateCustomTemplate: state.updateCustomTemplate,
    updateThemeColor: state.updateThemeColor,
    updateTypography: state.updateTypography,
    applyFullResume: state.applyFullResume,
    applyWorkspaceResolution: state.applyWorkspaceResolution,
  }));
