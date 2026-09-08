'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { cx, modalContent, modalOverlay } from '@magic-resume/design-system';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  variant = 'danger',
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      {/* Custom overlay carries a higher z-index so the dialog floats above the AI Lab. */}
      <div className={`z-150 fixed inset-0 ${isOpen ? 'block' : 'hidden'}`}>
        {/* Slightly deeper scrim + soft blur to focus the dialog over the dark workbench. */}
        <div className={cx(modalOverlay, 'cursor-pointer')} onClick={onClose} />
        <AlertDialogContent
          className={cx(
            modalContent,
            'text-mr-ink grid max-w-[calc(100%-2rem)] gap-3.5 p-6 sm:max-w-md',
          )}
        >
          <AlertDialogHeader className="gap-2">
            <AlertDialogTitle className="text-lg font-semibold tracking-tight text-neutral-50">
              {title}
            </AlertDialogTitle>
            {description && (
              <AlertDialogDescription className="text-mr-caption leading-relaxed text-neutral-400">
                {description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-3 gap-2">
            <AlertDialogCancel
              onClick={onClose}
              className="rounded-lg border border-mr-line bg-transparent px-4 text-neutral-300 hover:bg-mr-surface-subtle hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-white/15 focus-visible:ring-offset-0"
            >
              {cancelText || t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={
                variant === 'danger'
                  ? // Restrained destructive: theme red #dc2626, softened a touch so it signals without shouting.
                    'rounded-lg border-none bg-red-600/90 px-4 font-medium text-[#fff] hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-0'
                  : // Positive confirm uses the brand sky accent, matching the composer send button.
                    'rounded-lg border-none bg-sky-500 px-4 font-medium text-[#fff] hover:bg-sky-600 focus-visible:ring-2 focus-visible:ring-sky-400/40 focus-visible:ring-offset-0'
              }
            >
              {confirmText || t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </div>
    </AlertDialog>
  );
}
