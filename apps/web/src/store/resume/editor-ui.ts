import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeEditorUiStore = Pick<
  ResumeState,
  | 'isAiGenerating'
  | 'setIsAiGenerating'
  | 'rightCollapsed'
  | 'leftCollapsed'
  | 'activeSection'
  | 'setRightCollapsed'
  | 'setLeftCollapsed'
  | 'setActiveSection'
>;

export const useResumeEditorUiStore =
  createResumeDomainStore<ResumeEditorUiStore>((state) => ({
    isAiGenerating: state.isAiGenerating,
    setIsAiGenerating: state.setIsAiGenerating,
    rightCollapsed: state.rightCollapsed,
    leftCollapsed: state.leftCollapsed,
    activeSection: state.activeSection,
    setRightCollapsed: state.setRightCollapsed,
    setLeftCollapsed: state.setLeftCollapsed,
    setActiveSection: state.setActiveSection,
  }));
