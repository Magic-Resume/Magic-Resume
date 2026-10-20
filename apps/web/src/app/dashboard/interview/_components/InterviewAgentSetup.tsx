'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Square,
} from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { Select, SelectItem } from '@/components/ui/product-select';
import {
  interviewApi,
  type InterviewAgentSettings,
  type InterviewSetupOptions,
  type InterviewVoiceChannel,
} from '@/lib/api/interviewApi';
import type { InterviewVoicePreview } from './useInterviewVoicePreview';
import styles from './InterviewAgentSetup.module.css';

export default function InterviewAgentSetup({
  initialSettings,
  onConfirm,
  preview,
}: {
  initialSettings?: InterviewAgentSettings;
  preview: InterviewVoicePreview;
  onConfirm: (settings: InterviewAgentSettings) => void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<InterviewSetupOptions | null>(null);
  const [voice, setVoice] = useState(initialSettings?.voice ?? '');
  const [model, setModel] = useState(initialSettings?.reportModel ?? '');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [reset, setReset] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void interviewApi
      .setupOptions(
        process.env.NEXT_PUBLIC_INTERVIEW_VOICE_CHANNEL as
          InterviewVoiceChannel | undefined,
      )
      .then((result) => {
        if (cancelled) return;
        setOptions(result);
        setVoice((current) =>
          result.voices.some((item) => item.id === current)
            ? current
            : result.defaultVoice,
        );
        setModel((current) => {
          if (current && !result.reportModels.includes(current)) {
            setReset(true);
            return '';
          }
          return current;
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const previewActive =
    preview.state.voice === voice &&
    (preview.state.phase === 'playing' || preview.state.phase === 'loading');
  const previewLoading = previewActive && preview.state.phase === 'loading';
  const voiceName =
    options?.voices.find((item) => item.id === voice)?.name ||
    t('aiLab.interview.setup.systemVoice');

  return (
    <>
      <div className={styles.heading}>
        <span className={styles.eyebrow}>Voice Agent</span>
        <h1>{t('aiLab.interview.setup.title')}</h1>
      </div>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (loading || failed || !options) return;
          preview.stop();
          onConfirm({
            ...(voice ? { voice } : {}),
            ...(model ? { reportModel: model } : {}),
          });
        }}
      >
        <fieldset className={styles.voices} disabled={loading || failed}>
          <legend id="interview-voice-label">
            <Mic size={14} aria-hidden="true" />
            {t('aiLab.interview.setup.voice')}
          </legend>
          <div className={styles.voiceControls}>
            <Select
              className={styles.voiceSelect}
              aria-labelledby="interview-voice-label"
              selectedKey={`voice:${voice}`}
              onSelectionChange={(key) => {
                if (key !== null) {
                  preview.stop();
                  setVoice(String(key).slice('voice:'.length));
                }
              }}
              isDisabled={loading || failed}
              triggerClassName={styles.selectTrigger}
              popoverClassName={styles.selectPopover}
            >
              {!options ? (
                <SelectItem id="voice:" className={styles.selectOption}>
                  {t(
                    loading
                      ? 'aiLab.interview.setup.loading'
                      : 'aiLab.interview.setup.systemVoice',
                  )}
                </SelectItem>
              ) : (
                options.voices.map((item) => (
                  <SelectItem
                    key={item.id}
                    id={`voice:${item.id}`}
                    className={styles.selectOption}
                  >
                    {item.name || t('aiLab.interview.setup.systemVoice')}
                    {item.id === options.defaultVoice
                      ? ` · ${t('aiLab.interview.setup.default')}`
                      : ''}
                  </SelectItem>
                ))
              )}
            </Select>
            <button
              type="button"
              className={styles.previewButton}
              onClick={() => preview.toggle(voice)}
              disabled={loading || failed || !preview.hasSample(voice)}
              aria-pressed={previewActive}
              aria-label={t(
                previewActive
                  ? 'aiLab.interview.setup.stopPreviewLabel'
                  : 'aiLab.interview.setup.previewLabel',
                { voice: voiceName },
              )}
            >
              {previewLoading ? (
                <Loader2
                  size={16}
                  className={styles.spinner}
                  aria-hidden="true"
                />
              ) : previewActive ? (
                <Square size={15} aria-hidden="true" />
              ) : (
                <Play size={16} aria-hidden="true" />
              )}
              {t(
                previewActive
                  ? 'aiLab.interview.setup.stopPreview'
                  : 'aiLab.interview.setup.preview',
              )}
            </button>
          </div>
          {preview.state.voice === voice && preview.state.phase === 'error' && (
            <p className={styles.notice} role="status">
              {t('aiLab.interview.setup.previewFailed')}
            </p>
          )}
        </fieldset>
        <span className={styles.modelLabel} id="interview-report-model-label">
          {t('aiLab.interview.setup.model')}
        </span>
        <Select
          aria-labelledby="interview-report-model-label"
          selectedKey={`model:${model}`}
          onSelectionChange={(key) => {
            if (key === null) return;
            setModel(String(key).slice('model:'.length));
            setReset(false);
          }}
          isDisabled={loading || failed}
          triggerClassName={styles.selectTrigger}
          popoverClassName={styles.selectPopover}
        >
          <SelectItem id="model:" className={styles.selectOption}>
            {t('aiLab.interview.setup.autoModel')}
          </SelectItem>
          {options?.reportModels.map((name) => (
            <SelectItem
              key={name}
              id={`model:${name}`}
              className={styles.selectOption}
            >
              {name}
            </SelectItem>
          ))}
        </Select>
        {options?.catalogDegraded && (
          <p className={styles.notice}>
            {t('aiLab.interview.setup.catalogDegraded')}
          </p>
        )}
        {reset && (
          <p className={styles.notice} role="status">
            {t('aiLab.interview.setup.selectionReset')}
          </p>
        )}
        {failed && (
          <div className={styles.error} role="status">
            <p>{t('aiLab.interview.setup.failed')}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RefreshCw size={14} />
              {t('aiLab.interview.problem.retry')}
            </button>
          </div>
        )}
        <button
          className={styles.start}
          type="submit"
          disabled={loading || failed || !options}
        >
          {loading && <Loader2 className={styles.spinner} size={17} />}
          {t('aiLab.interview.setup.enter')}
          {!loading && <ArrowRight size={17} aria-hidden="true" />}
        </button>
      </form>
    </>
  );
}
