'use client';

import { useResumeDocumentStore } from '@/store/resume/document';
import { useResumeEditorUiStore } from '@/store/resume/editor-ui';
import { useInterceptModalRoute } from '@/hooks/useInterceptModalRoute';
import AIModal from '../../../_components/modals/AIModal';

export default function AIModalPage() {
  const { open, close } = useInterceptModalRoute();
  const {
    activeResume,
    updateSections,
    updateInfo,
    applyFullResume,
    applyWorkspaceResolution,
  } = useResumeDocumentStore();
  const { isAiGenerating, setIsAiGenerating } = useResumeEditorUiStore();

  const templateId = activeResume?.template || 'classic';

  if (!activeResume) return null;

  return (
    <AIModal
      isOpen={open}
      onClose={close}
      resumeData={activeResume}
      onApplySectionChanges={updateSections}
      onApplyInfo={updateInfo}
      onApplyFullResume={applyFullResume}
      onApplyWorkspaceResolution={applyWorkspaceResolution}
      templateId={templateId}
      isAiJobRunning={isAiGenerating}
      setIsAiJobRunning={setIsAiGenerating}
    />
  );
}
