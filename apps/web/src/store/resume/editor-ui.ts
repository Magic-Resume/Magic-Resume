import { createResumeDomainStore } from './bridge';
import type { ResumeState } from '@/store/useResumeStore';

export type ResumeEditorUiStore = Pick<
  ResumeState,
  | 'rightCollapsed'
  | 'leftCollapsed'
  | 'activeSection'
  | 'setRightCollapsed'
  | 'setLeftCollapsed'
  | 'setActiveSection'
>;

export const useResumeEditorUiStore =
  createResumeDomainStore<ResumeEditorUiStore>((state) => ({
    rightCollapsed: state.rightCollapsed,
    leftCollapsed: state.leftCollapsed,
    activeSection: state.activeSection,
    setRightCollapsed: state.setRightCollapsed,
    setLeftCollapsed: state.setLeftCollapsed,
    setActiveSection: state.setActiveSection,
  }));
