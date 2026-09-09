import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeEditorUiStore = Pick<
  ResumeState,
  | 'rightCollapsed'
  | 'leftCollapsed'
  | 'activeSection'
  | 'isAiGenerating'
  | 'setRightCollapsed'
  | 'setLeftCollapsed'
  | 'setActiveSection'
  | 'setIsAiGenerating'
>;

export const useResumeEditorUiStore =
  createResumeDomainStore<ResumeEditorUiStore>((state) => ({
    rightCollapsed: state.rightCollapsed,
    leftCollapsed: state.leftCollapsed,
    activeSection: state.activeSection,
    isAiGenerating: state.isAiGenerating,
    setRightCollapsed: state.setRightCollapsed,
    setLeftCollapsed: state.setLeftCollapsed,
    setActiveSection: state.setActiveSection,
    setIsAiGenerating: state.setIsAiGenerating,
  }));
