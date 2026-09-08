'use client';

import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { useResumeDocumentStore } from '@/store/resume/document';
import { ShareModal } from '@/app/dashboard/edit/_components/modals/ShareModal';
import { useEffect } from 'react';

export default function ShareModalPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { activeResume, loadResumeForEdit } = useResumeDocumentStore();

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

  return (
    <div className="bg-desk flex min-h-screen items-center justify-center">
      <ShareModal isOpen={true} onClose={() => handleOpenChange(false)} />
    </div>
  );
}
