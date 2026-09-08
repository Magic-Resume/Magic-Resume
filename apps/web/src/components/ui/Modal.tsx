'use client';

import React, { useEffect } from 'react';
import { cx, modalOverlay, surfaceVariants } from '@magic-resume/design-system';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = originalStyle;
    }

    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={cx(
        modalOverlay,
        'bg-desk/70 flex cursor-pointer items-start justify-center overflow-y-auto p-4',
      )}
      onClick={onClose}
    >
      <div
        className={cx(
          surfaceVariants({ tone: 'default', padding: 'lg' }),
          'relative my-auto flex w-full max-w-2xl flex-col bg-neutral-900 shadow-xl',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-neutral-700 pb-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-neutral-400 transition-colors hover:text-white"
          >
            {'×'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
