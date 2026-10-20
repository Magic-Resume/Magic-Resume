'use client';

import React, { useId } from 'react';
import { Mic, MicOff, Phone, X } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { VoiceOrb } from './VoiceOrb';
import type { AudioLevel, OrbAppearance, VoiceStatus } from './types';
import './voice-agent.css';

export interface VoiceAgentProps {
  status: VoiceStatus;
  muted?: boolean;
  appearance?: OrbAppearance;
  title?: string;
  transcript?: string | false;
  orbSize?: number;
  audioLevel?: AudioLevel;
  surface?: 'card' | 'minimal' | 'embedded';
  className?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onMuteChange?: (muted: boolean) => void;
}

/** 嵌入模式只呈现球体；音轨、字幕、计时和按钮均由宿主会话管理。 */
export function VoiceAgent({
  status,
  muted = false,
  appearance = 'halo',
  title,
  transcript,
  orbSize,
  audioLevel,
  surface = 'card',
  className = '',
  onStart,
  onEnd,
  onMuteChange,
}: VoiceAgentProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const active = ['listening', 'thinking', 'speaking'].includes(status);
  const connecting = status === 'connecting';
  const statusKey =
    status === 'ended' ? 'finished' : status === 'idle' ? 'starting' : status;
  const label =
    muted && active && status !== 'speaking'
      ? t('aiLab.interview.voiceAgent.muted')
      : t(`aiLab.interview.${statusKey}`);
  const action = active
    ? t('aiLab.interview.end')
    : connecting
      ? t('common.cancel')
      : status === 'ended'
        ? t('aiLab.interview.report.actions.again')
        : t('aiLab.interview.startVoice');
  const ActionIcon = active ? Phone : connecting ? X : Mic;
  const embedded = surface === 'embedded';
  return (
    <section
      className={`voice-agent ${className}`}
      data-surface={surface}
      data-status={status}
      aria-label={embedded ? label : undefined}
      aria-labelledby={embedded ? undefined : titleId}
    >
      {!embedded && (
        <header className="voice-agent__header">
          <h2 id={titleId}>{title ?? t('aiLab.interview.title')}</h2>
          <Mic size={16} aria-hidden="true" />
        </header>
      )}
      <div className="voice-agent__visualizer">
        <VoiceOrb
          appearance={appearance}
          status={status}
          muted={muted && status !== 'speaking'}
          size={orbSize}
          audioLevel={audioLevel}
          speed={status === 'ended' ? 0 : 1}
        />
      </div>
      {!embedded && (
        <>
          <div className="voice-agent__message">
            <output
              className="voice-agent__status"
              aria-live="polite"
              aria-atomic="true"
            >
              {label}
            </output>
            {transcript !== false && (
              <div className="voice-agent__transcript">{transcript ?? ''}</div>
            )}
          </div>
          <div className="voice-agent__footer">
            <div className="voice-agent__controls" data-active={active}>
              <button
                type="button"
                className="voice-agent__mute"
                aria-label={t(
                  muted ? 'aiLab.interview.unmute' : 'aiLab.interview.mute',
                )}
                aria-pressed={muted}
                disabled={!active || !onMuteChange}
                tabIndex={active ? 0 : -1}
                aria-hidden={!active}
                onClick={() => onMuteChange?.(!muted)}
              >
                {muted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                type="button"
                className="voice-agent__action"
                disabled={!(active || connecting ? onEnd : onStart)}
                onClick={active || connecting ? onEnd : onStart}
              >
                <ActionIcon size={16} aria-hidden="true" />
                <span>{action}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
