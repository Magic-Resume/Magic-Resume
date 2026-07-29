"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Resume } from '@/types/frontend/resume';
import { useResumeStore } from '@/store/useResumeStore';
import { useSettingStore } from '@/store/useSettingStore';
import ResumeList from './_components/ResumeList';
import RenameResumeDialog from './_components/RenameResumeDialog';

export default function Dashboard() {
  const router = useRouter();
  const { resumes, deleteResume, duplicateResume, loadResumes, renameResume } = useResumeStore();
  const { loadSettings } = useSettingStore();

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [resumeToRename, setResumeToRename] = useState<Resume | null>(null);
  const [newName, setNewName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const initialized = React.useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initializeDashboard = async () => {
      try {
        setIsLoading(true);
        await Promise.all([loadResumes(), loadSettings()]);
      } catch (error) {
        console.error('Failed to initialize dashboard:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeDashboard();
  }, [loadResumes, loadSettings]);

  const handleOpenRenameDialog = useCallback((resume: Resume) => {
    setResumeToRename(resume);
    setNewName(resume.name);
    setRenameDialogOpen(true);
  }, []);

  const handleRename = useCallback(async () => {
    if (resumeToRename && newName.trim()) {
      await renameResume(resumeToRename.id, newName);
      setRenameDialogOpen(false);
      setResumeToRename(null);
    }
  }, [resumeToRename, newName, renameResume]);

  // 这两个按钮不再手动上报：`data-magic-dashboard-create` /
  // `data-magic-dashboard-import` 加上清单映射就是全部，事件名和要不要收都在
  // 清单里改。它们是纯粹的点击意图，没有任何只有代码知道的东西要一起带走。
  const handleAdd = useCallback(() => {
    router.push('/dashboard/new');
  }, [router]);

  const handleImport = useCallback(() => {
    router.push('/dashboard/import');
  }, [router]);

  const handleResumeDelete = useCallback(async (id: string) => {
    await deleteResume(id);
  }, [deleteResume]);

  const handleDuplicate = useCallback(async (id: string) => {
    duplicateResume(id);
  }, [duplicateResume]);

  return (
    <main className="flex flex-col h-full" data-magic-dashboard-list>
      <RenameResumeDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        newName={newName}
        setNewName={setNewName}
        handleRename={handleRename}
      />
      <ResumeList
        resumes={resumes}
        onAdd={handleAdd}
        onImport={handleImport}
        onDelete={handleResumeDelete}
        onDuplicate={handleDuplicate}
        onRename={handleOpenRenameDialog}
        isLoading={isLoading}
      />
    </main>
  );
}
