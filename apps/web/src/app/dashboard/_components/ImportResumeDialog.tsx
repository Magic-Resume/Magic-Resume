import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Loader2, X, FileJson } from '@magic-resume/icons';
import { Button } from '@/components/ui/button';
import { Resume } from '@/types/frontend/resume';
import { useResumeDocumentStore } from '@/store/resume/document';
import { toast } from 'sonner';
import { FaFileUpload } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { appLifecycle } from '@/lib/extensions/app-lifecycle';
import { getFileSizeBucket } from '@/lib/utils/fileSize';
import {
  formatResumeImportError,
  validateAndNormalizeImportedResume,
} from '@/lib/validation/importResume';

type ImportResumeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Imports a resume exported as Magic Resume JSON. Read in the browser; nothing is uploaded. */
export default function ImportResumeDialog({ open, onOpenChange }: ImportResumeDialogProps) {
  const { importResume } = useResumeDocumentStore();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { t, i18n } = useTranslation();

  const handleClose = useCallback((open: boolean) => {
    if (!open) setUploadError(null);
    onOpenChange(open);
  }, [onOpenChange]);

  const readJsonFile = useCallback(async (file: File) => {
    const reader = new FileReader();
    const content = await new Promise<string>((resolve, reject) => {
      reader.onabort = () => reject(new Error(t('importDialog.errors.fileReadAborted')));
      reader.onerror = () => reject(new Error(t('importDialog.errors.fileReadFailed')));
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(file);
    });
    return validateAndNormalizeImportedResume(JSON.parse(content));
  }, [t]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploadError(null);
    const file = acceptedFiles[acceptedFiles.length - 1];
    if (!file) return;
    setIsImporting(true);

    try {
      const result = await readJsonFile(file);
      const rest = { ...(result as Record<string, unknown>) };

      const resumeName = result.info?.fullName
        ? (i18n.language.startsWith('zh') ? `${result.info.fullName}的简历` : `${result.info.fullName}'s Resume`)
        : (rest.name as string) || t('importDialog.defaultName');

      const newResume: Resume = {
        ...rest,
        id: Date.now().toString(),
        name: resumeName,
        updatedAt: Date.now(),
        template: (rest.template as string) || 'classic',
        themeColor: (rest.themeColor as string) || '#f97316',
        typography: (rest.typography as string) || 'inter',
        customTemplate: (rest.customTemplate as Resume['customTemplate']) || {},
      } as Resume;

      await importResume(newResume);
      appLifecycle.resumeImportCompleted({
        source: 'json',
        sizeBucket: getFileSizeBucket(file.size),
      });

      toast.success(t('importDialog.success'));
      handleClose(false);
    } catch (e) {
      const message = formatResumeImportError(e, t('importDialog.errors.parseFailed'));
      toast.error(message);
      setUploadError(message);
    } finally {
      setIsImporting(false);
    }
  }, [importResume, handleClose, t, readJsonFile, i18n.language]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    multiple: false,
    disabled: isImporting,
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isImporting && handleClose(false)}
            className="fixed inset-0 bg-black/50 z-100 backdrop-blur-sm cursor-pointer"
          />
          <div className="fixed inset-0 z-101 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-raised border border-neutral-800 rounded-3xl shadow-2xl p-8 pointer-events-auto"
              data-magic-import-panel
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-bold text-white">{t('importDialog.title')}</h2>
                <button
                  onClick={() => !isImporting && handleClose(false)}
                  className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
                  type="button"
                  disabled={isImporting}
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-sm text-neutral-400 mb-6">{t('importDialog.description')}</p>

              {/* 上传区域 */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
                  ${isDragActive ? 'border-sky-500 bg-sky-500/10 shadow-[0_0_20px_rgba(14,165,233,0.15)]' : 'border-neutral-700 bg-neutral-900/50 hover:border-sky-600 hover:bg-neutral-800/50'}
                  ${isImporting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                `}
              >
                <input {...getInputProps()} />
                {isImporting ? (
                  <div className="flex flex-col items-center justify-center text-sky-500">
                    <Loader2 className="w-10 h-10 mb-3 animate-spin" />
                    <p className="font-medium text-sm">{t('importDialog.importing')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500 mb-3">
                      <FaFileUpload size={24} />
                    </div>
                    {isDragActive ? (
                      <p className="text-sky-400 font-medium text-sm">{t('importDialog.dropzone.active')}</p>
                    ) : (
                      <p className="text-neutral-300 font-medium text-sm">{t('importDialog.dropzone.default')}</p>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-neutral-500 bg-neutral-800/60 px-2.5 py-1 rounded-full mt-2.5">
                      <FileJson size={11} />
                      {'.json'}
                    </span>
                  </div>
                )}
              </div>

              {uploadError && (
                <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">{uploadError}</p>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => handleClose(false)}
                  disabled={isImporting}
                  className="text-neutral-400 hover:text-white hover:bg-neutral-800"
                >
                  {t('importDialog.cancel')}
                </Button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
