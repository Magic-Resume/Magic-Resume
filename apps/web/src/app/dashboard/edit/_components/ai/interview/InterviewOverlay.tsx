'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PolarisAvatar } from '../PolarisMark';

type InterviewOverlayProps = {
  open: boolean;
  onBack: () => void;
};

/**
 * 模拟面试的占位屏。
 *
 * 之前这里是一整套静态 mock：计时器写死 02:14、麦克风按钮没有 onClick、声波条只是
 * 装饰、问题写在 i18n 里，结束时还回一句「已生成面试纪要」——纪要并不存在。它看起来
 * 像功能，做的却只是让人以为自己在面试。
 *
 * 后端其实已经建好（controller + realtime WebSocket + TTS），只是前端一次都没调。
 * 在真正接上之前，这里如实说「还没上线」。
 */
export default function InterviewOverlay({ open, onBack }: InterviewOverlayProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 z-30 bg-desk flex flex-col"
        >
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-hairline">
            <button
              type="button"
              onClick={onBack}
              aria-label={t('common.back')}
              className="text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium text-primary">{t('aiLab.interview.title')}</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8">
            <PolarisAvatar className="w-14 h-14" />
            <div className="inline-flex items-center gap-1.5 rounded-full bg-tint-sky px-3 py-1 text-[11px] text-ink-sky">
              <Mic size={12} />
              {t('aiLab.interview.comingSoonBadge')}
            </div>
            <p className="max-w-sm text-center text-sm leading-relaxed text-secondary">
              {t('aiLab.interview.comingSoon')}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="rounded-full bg-sunk px-5 py-2 text-sm text-primary hover:bg-raised transition-colors cursor-pointer"
            >
              {t('common.back')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
