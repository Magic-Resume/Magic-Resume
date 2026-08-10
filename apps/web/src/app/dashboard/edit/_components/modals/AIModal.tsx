import React, { useState } from 'react';
import { InfoType, Resume, Section } from '@/types/frontend/resume';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import AiChatShell from '../ai/AiChatShell';
import ConfirmDialog from '@/components/shared/ConfirmDialog';

type AIModalProps = {
  isOpen: boolean;
  onClose: () => void;
  resumeData: Resume;
  onApplySectionChanges: (newSections: Section) => void;
  onApplyInfo: (info: InfoType) => void;
  onApplyFullResume: (newResume: Resume) => void;
  templateId: string;
  isAiJobRunning: boolean;
  setIsAiJobRunning: (isRunning: boolean) => void;
};

export default function AIModal({
  isOpen,
  onClose,
  resumeData,
  onApplySectionChanges,
  onApplyInfo,
  onApplyFullResume,
  templateId,
  isAiJobRunning,
  setIsAiJobRunning,
}: AIModalProps) {
  // 点遮罩关闭。生成中先问一句——同 AiChatShell 里那颗关闭按钮走同一套文案与对话框，
  // 不用 window.confirm：系统弹窗样式不可控、带 "localhost:3000 显示" 抬头，而且同步
  // 阻塞主线程。
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const handleBackdropClose = () => {
    if (isAiJobRunning) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClose}
            className="fixed inset-0 bg-black/40 z-100 backdrop-blur-sm cursor-pointer"
          />
          <div className="fixed inset-0 z-101 flex items-center justify-center p-3 sm:p-5 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              className="w-full h-full max-w-[1500px] bg-desk border border-neutral-800 rounded-3xl shadow-[0_8px_28px_rgba(0,0,0,0.14)] overflow-hidden focus:outline-none pointer-events-auto"
              data-magic-ai-lab
            >
              <AiChatShell
                resumeData={resumeData}
                templateId={templateId}
                onClose={onClose}
                onApplySections={onApplySectionChanges}
                onApplyInfo={onApplyInfo}
                onApplyFullResume={onApplyFullResume}
                setIsAiJobRunning={setIsAiJobRunning}
              />
            </motion.div>
          </div>
          <ConfirmDialog
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              onClose();
            }}
            title={t('aiLab.closeConfirm.title')}
            description={t('aiLab.closeConfirm.description')}
            confirmText={t('aiLab.closeConfirm.confirm')}
            cancelText={t('common.cancel')}
            variant="danger"
          />
        </>
      )}
    </AnimatePresence>
  );
}
