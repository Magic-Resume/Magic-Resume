'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { VoiceTurn } from './useVoiceInterview';
import { transcriptDisplayTurns } from './mergeTurns';

import { EASE_ENTER } from '@magic-resume/utils';
/**
 * 对话记录。
 *
 * 默认是收着的——正在通话的人不读聊天记录，他在听、在想下一句怎么答，满屏文字只会把
 * 注意力从「说」拽到「读」。点球才翻开。
 *
 * 底部留出一整个球的高度：展开时球会缩小落到那里，文字不能压在它身上。
 */
export default function Transcript({
  turns,
  live,
  liveReply,
  liveAt,
  liveReplyAt,
}: {
  turns: VoiceTurn[];
  /** 你正在说的那句。 */
  live: string;
  /** 面试官正在说的那句。已定稿的部分同时也在 `turns` 里，所以两者不会重复显示。 */
  liveReply: string;
  liveAt?: number | null;
  liveReplyAt?: number | null;
}) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  const displayTurns = transcriptDisplayTurns(
    turns,
    live,
    liveReply,
    liveAt,
    liveReplyAt,
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, live, liveReply]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.34, ease: EASE_ENTER }}
      className="absolute inset-0 overflow-y-auto px-5 pb-44 pt-2"
    >
      {turns.length === 0 && !live && !liveReply ? (
        <p className="text-mr-caption text-muted pt-10 text-center">
          {t('aiLab.interview.transcriptEmpty')}
        </p>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {displayTurns.map((turn, index) => (
            <Line
              key={`${turn.role}:${turn.segmentId ?? turn.at ?? index}`}
              role={turn.role}
              text={turn.text}
              pending={turn.pending}
            />
          ))}
          <div ref={endRef} />
        </div>
      )}
    </motion.div>
  );
}

function Line({
  role,
  text,
  pending,
}: {
  role: VoiceTurn['role'];
  text: string;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-mr-label text-muted">
        {t(
          role === 'interviewer'
            ? 'aiLab.interview.interviewer'
            : 'aiLab.interview.you',
        )}
      </span>
      <p
        className={`text-mr-caption leading-relaxed ${
          pending
            ? 'text-muted'
            : role === 'interviewer'
              ? 'text-primary'
              : 'text-secondary'
        }`}
      >
        {text}
      </p>
    </div>
  );
}
