'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

/**
 * 中途离开的确认。
 *
 * 措辞刻意不吓人：会话状态在服务端，离开**只是中断这一次语音**，回到同一个 URL 还能续。
 * 说成「面试将丢失」是谎，用户会因此不敢关页面。
 */
export default function LeaveConfirm({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-desk/80 px-8 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm rounded-2xl bg-raised p-5"
          >
            <p className="text-sm leading-relaxed text-primary">
              {t('aiLab.interview.leaveTitle')}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">
              {t('aiLab.interview.leaveHint')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="cursor-pointer rounded-xl px-4 py-2 text-[13px] text-secondary transition-colors hover:text-primary"
              >
                {t('aiLab.interview.leaveCancel')}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="cursor-pointer rounded-xl bg-sunk px-4 py-2 text-[13px] text-rev-del transition-colors hover:bg-desk"
              >
                {t('aiLab.interview.leaveConfirm')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
