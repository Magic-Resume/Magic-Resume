'use client';

import { useResumeStore } from '@/store/useResumeStore';
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
    isAiGenerating,
    setIsAiGenerating,
  } = useResumeStore();

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
