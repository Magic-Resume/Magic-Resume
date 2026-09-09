import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Link, Copy, Check, Lock } from '@magic-resume/icons';

import { useResumeSharingStore } from '@/store/resume/sharing';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import { isLocalResumeId } from '@/lib/api/resume';

import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

import { EASE_ENTER } from '@magic-resume/utils';
interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { activeResume, updateSharing, saveResume, syncStatus } =
    useResumeSharingStore();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-sync if it's a local resume (ID is a timestamp)
  useEffect(() => {
    if (isOpen && activeResume) {
      const isLocalId = isLocalResumeId(activeResume.id);
      if (isLocalId && syncStatus !== 'syncing') {
        saveResume('manual');
      }
    }
  }, [isOpen, activeResume, syncStatus, saveResume]);

  const isSyncing = syncStatus === 'syncing';

  // Derive state from activeResume
  const isPublic = activeResume?.isPublic || false;
  const shareRole = activeResume?.shareRole || 'VIEWER';

  const shareUrl = useMemo(() => {
    return typeof window !== 'undefined' && activeResume?.shareId
      ? `${window.location.origin}/s/${activeResume.shareId}`
      : '';
  }, [activeResume?.shareId]);

  const handleTogglePublic = useCallback(
    async (checked: boolean) => {
      setLoading(true);
      try {
        await updateSharing(checked, shareRole);
        // Only once the link actually exists — the toggle is the intent, the
        // successful write is the fact. Turning sharing off is not a creation.
        if (checked) appLifecycle.shareLinkCreated();
      } finally {
        setLoading(false);
      }
    },
    [shareRole, updateSharing],
  );

  const handleRoleChange = useCallback(
    async (role: 'VIEWER' | 'COMMENTER') => {
      if (!isPublic) return;
      setLoading(true);
      try {
        await updateSharing(true, role);
      } finally {
        setLoading(false);
      }
    },
    [isPublic, updateSharing],
  );

  const copyToClipboard = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(t('modals.share.copySuccess'));
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl, t]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="z-100 fixed inset-0 cursor-pointer bg-black/70 backdrop-blur-sm"
          />
          <div className="z-101 pointer-events-none fixed inset-0 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 12 }}
              transition={{ duration: 0.2, ease: EASE_ENTER }}
              className="bg-desk pointer-events-auto w-full max-w-md rounded-2xl p-6 shadow-[0_24px_70px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.07]"
              data-magic-share-panel
            >
              <div className="mb-6 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/10 text-sky-400 ring-1 ring-sky-400/20">
                    <Globe size={17} />
                  </div>
                  <div>
                    <h2 className="text-mr-subtitle font-semibold tracking-tight text-white">
                      {t('modals.share.title')}
                    </h2>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="-mr-1 -mt-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Public Toggle */}
                <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.02] p-4 ring-1 ring-mr-line-soft">
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        'mt-0.5',
                        isPublic ? 'text-sky-400' : 'text-neutral-500',
                      )}
                    >
                      {isPublic ? <Globe size={17} /> : <Lock size={17} />}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white">
                        {t('modals.share.publicAccess')}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-500">
                        {isSyncing
                          ? t('modals.share.syncing')
                          : isPublic
                            ? t('modals.share.publicAccessDesc')
                            : t('modals.share.privateAccessDesc')}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'group relative inline-flex shrink-0 cursor-pointer items-center',
                      (loading || isSyncing) &&
                        'pointer-events-none cursor-not-allowed opacity-50',
                    )}
                    onClick={() =>
                      !loading && !isSyncing && handleTogglePublic(!isPublic)
                    }
                    role="switch"
                    aria-checked={isPublic}
                  >
                    <div
                      className={cn(
                        'h-6 w-11 rounded-full transition-colors duration-200 ease-out',
                        isPublic ? 'bg-sky-500' : 'bg-white/10',
                      )}
                    >
                      <div
                        className={cn(
                          'absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#fff] shadow-sm transition-transform duration-200 ease-out',
                          isPublic ? 'translate-x-5' : 'translate-x-0',
                        )}
                      >
                        {(loading || isSyncing) && (
                          <div className="h-2 w-2 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Link Section (Only if Public) */}
                <AnimatePresence initial={false}>
                  {isPublic && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: EASE_ENTER }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 pt-1">
                        {/* Permissions */}
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.03] p-1 ring-1 ring-white/[0.05]">
                          <button
                            type="button"
                            onClick={() => handleRoleChange('VIEWER')}
                            className={cn(
                              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                              shareRole === 'VIEWER'
                                ? 'bg-sky-400/12 text-sky-300 ring-1 ring-sky-400/25'
                                : 'text-neutral-400 hover:text-white',
                            )}
                          >
                            {t('modals.share.readOnly')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRoleChange('COMMENTER')}
                            className={cn(
                              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                              shareRole === 'COMMENTER'
                                ? 'bg-sky-400/12 text-sky-300 ring-1 ring-sky-400/25'
                                : 'text-neutral-400 hover:text-white',
                            )}
                          >
                            {t('modals.share.allowComments')}
                          </button>
                        </div>

                        {/* Link Copy */}
                        <div className="relative">
                          <div className="bg-sunk flex items-center rounded-lg p-3 pr-12 ring-1 ring-mr-line-soft transition-shadow focus-within:ring-sky-400/40">
                            <Link
                              size={15}
                              className="min-w-[15px] text-neutral-500"
                            />
                            <input
                              readOnly
                              value={shareUrl}
                              className="ml-3 w-full truncate border-none bg-transparent text-sm text-neutral-300 focus:outline-none"
                            />
                          </div>
                          <button
                            data-magic-share-link-copy
                            className="absolute right-1.5 top-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
                            onClick={copyToClipboard}
                          >
                            {copied ? (
                              <Check size={14} className="text-sky-400" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-6 flex justify-end border-t border-mr-line-soft pt-4">
                <button
                  onClick={onClose}
                  className="cursor-pointer rounded-lg bg-mr-surface-soft px-4 py-2 text-sm font-medium text-neutral-200 ring-1 ring-white/[0.08] transition-colors hover:bg-white/10"
                >
                  {t('common.done')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
