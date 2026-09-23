'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mic, MicOff, Send } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';

/**
 * 底部那一条：输入框 + 静音 + 结束。
 *
 * **输入框常驻，不是"顺便支持打字"。** 模式不是用户要提前做的决定，是他当下的处境——
 * 地铁上、室友在旁边就打字，一个人在房间里就说话，而这两件事会发生在同一场面试的不同
 * 时刻。以前把它做成入口处的二选一，等于逼人预测二十分钟后的自己。
 *
 * 状态（在听/在想/在说）不在这里出现——球已经有整套参数语汇在表达它了，
 * 再放一枚「在听」胶囊是把同一件事说两遍。
 */
export default function InterviewComposer({
  value,
  onChange,
  onSend,
  onToggleMute,
  onEnd,
  busy,
  muted,
  micDenied,
  expired,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  onToggleMute: () => void;
  onEnd: () => void;
  busy: boolean;
  muted: boolean;
  micDenied: boolean;
  expired: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const canSend = Boolean(value.trim()) && !busy && !expired;

  return (
    <motion.div
      // 球落定之后再淡入：先建立「它在这儿」，房间再围着它长出来。
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.7 }}
      className="shrink-0 px-5 pb-6"
    >
      {micDenied && (
        <p className="text-mr-overline text-secondary mx-auto mb-2 max-w-2xl text-center">
          {t('aiLab.interview.micDeniedHint')}
        </p>
      )}
      {expired && (
        <p
          className="text-mr-overline text-rev-del mx-auto mb-2 max-w-2xl text-center"
          role="status"
        >
          {t(error ? 'aiLab.interview.timeUpRetry' : 'aiLab.interview.timeUp')}
        </p>
      )}
      <div className="bg-raised/80 mx-auto flex max-w-2xl items-center gap-1.5 rounded-full py-1.5 pl-5 pr-1.5 backdrop-blur">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={expired}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={t('aiLab.interview.composerPlaceholder')}
          className="text-mr-caption text-primary placeholder:text-muted min-w-0 flex-1 bg-transparent py-2 outline-none disabled:opacity-40"
        />

        {(canSend || busy) && !expired ? (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label={t('aiLab.interview.send')}
            className="bg-tint-sky text-ink-sky hover:bg-tint-sky/80 cursor-pointer rounded-full p-2.5 transition-colors disabled:opacity-40"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleMute}
            disabled={micDenied || expired}
            aria-label={t(
              muted ? 'aiLab.interview.unmute' : 'aiLab.interview.mute',
            )}
            className="text-secondary hover:text-primary cursor-pointer rounded-full p-2.5 transition-colors disabled:opacity-30"
          >
            {muted || micDenied ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
        )}

        <button
          type="button"
          onClick={onEnd}
          disabled={busy}
          aria-label={t('aiLab.interview.end')}
          className="bg-sunk text-mr-label text-rev-del hover:bg-desk cursor-pointer rounded-full px-4 py-2.5 font-medium transition-colors disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            t('aiLab.interview.end')
          )}
        </button>
      </div>
    </motion.div>
  );
}
