'use client';

import { useRouter } from 'next/navigation';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useResumeEditorUiStore } from '@/store/resume/editor-ui';
import AIModal from '../../_components/modals/AIModal';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

export default function AIModalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const {
    activeResume,
    loadResumeForEdit,
    updateSections,
    updateInfo,
    applyFullResume,
    applyWorkspaceResolution,
  } = useResumeDocumentStore();
  const { isAiGenerating, setIsAiGenerating } = useResumeEditorUiStore();

  const templateId = activeResume?.template || 'classic';

  // Ensure resume is loaded if hitting this page directly
  useEffect(() => {
    if (id && (!activeResume || activeResume.id !== id)) {
      loadResumeForEdit(id);
    }
  }, [id, activeResume, loadResumeForEdit]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      router.push(`/dashboard/edit/${id}`);
    }
  };

  if (!activeResume) return null;

  return (
    <div className="bg-desk flex min-h-screen items-center justify-center">
      {/* Fallback for hard navigation: Just the modal */}
      <AIModal
        isOpen={true}
        onClose={() => handleOpenChange(false)}
        resumeData={activeResume}
        onApplySectionChanges={updateSections}
        onApplyInfo={updateInfo}
        onApplyFullResume={applyFullResume}
        onApplyWorkspaceResolution={applyWorkspaceResolution}
        templateId={templateId}
        isAiJobRunning={isAiGenerating}
        setIsAiJobRunning={setIsAiGenerating}
      />
    </div>
  );
}
