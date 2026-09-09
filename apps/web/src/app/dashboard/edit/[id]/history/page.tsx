'use client';

import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useResumeDocumentStore } from '@/store/resume/document';
import { useResumeVersionsStore } from '@/store/resume/versions';
import VersionHistoryDialog from '@/app/dashboard/edit/_components/modals/VersionHistoryDialog';
import { useEffect, useState, useRef } from 'react';
import { useSettingStore } from '@/store/useSettingStore';

export default function HistoryModalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const cloudSync = useSettingStore((state) => state.cloudSync);
  const { activeResume, loadResumeForEdit } = useResumeDocumentStore();
  const { refreshCloudVersions, restoreVersion, deleteVersion } =
    useResumeVersionsStore();

  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedHistory = useRef(false);

  useEffect(() => {
    if (id && (!activeResume || activeResume.id !== id)) {
      loadResumeForEdit(id);
    }
  }, [id, activeResume, loadResumeForEdit]);

  useEffect(() => {
    const loadHistory = async () => {
      if (activeResume && cloudSync && !hasLoadedHistory.current) {
        setIsLoading(true);
        hasLoadedHistory.current = true;
        try {
          await refreshCloudVersions(activeResume.id);
        } finally {
          setIsLoading(false);
        }
      }
    };
    if (activeResume && activeResume.id === id) {
      loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResume?.id, id, cloudSync, refreshCloudVersions]);

  const handleOpenChange = (open: boolean) => {
    if (!open) router.push(`/dashboard/edit/${id}`);
  };

  const handleRestoreVersion = (versionId: string) => {
    restoreVersion(versionId);
    handleOpenChange(false);
  };

  if (!activeResume) return null;

  return (
    <div className="bg-desk flex min-h-screen items-center justify-center">
      <VersionHistoryDialog
        isOpen={true}
        onClose={() => handleOpenChange(false)}
        onRestore={handleRestoreVersion}
        onDelete={async (versionId: string) => {
          if (activeResume) {
            await deleteVersion(activeResume.id, versionId);
          }
        }}
        versions={activeResume?.versions || []}
        isLoading={isLoading}
      />
    </div>
  );
}
