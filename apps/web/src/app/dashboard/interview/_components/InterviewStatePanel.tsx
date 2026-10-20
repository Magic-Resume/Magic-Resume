'use client';

import React, { type ReactNode } from 'react';
import { FileText, Loader2, RefreshCw } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import styles from './InterviewStatePanel.module.css';

export default function InterviewStatePanel({
  title,
  description,
  onBack,
  onRetry,
  retryLabel,
  busy = false,
  requestId,
  extraAction,
  children,
}: {
  title: string;
  description?: string;
  onBack?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
  requestId?: string;
  extraAction?: { label: string; onClick: () => void };
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section
      className={styles.panel}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles.icon} aria-hidden="true">
        {busy ? (
          <Loader2 className={styles.spinner} size={24} />
        ) : (
          <FileText size={24} />
        )}
      </div>
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {(onBack || onRetry || extraAction) && (
        <div className={styles.actions}>
          {onRetry && (
            <button
              type="button"
              className={styles.primary}
              onClick={onRetry}
              disabled={busy}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {retryLabel ?? t('aiLab.interview.problem.retry')}
            </button>
          )}
          {extraAction && (
            <button
              type="button"
              className={onRetry ? styles.secondary : styles.primary}
              onClick={extraAction.onClick}
            >
              {extraAction.label}
            </button>
          )}
          {onBack && (
            <button
              type="button"
              className={
                onRetry || extraAction ? styles.secondary : styles.primary
              }
              onClick={onBack}
            >
              {t('aiLab.interview.problem.back')}
            </button>
          )}
        </div>
      )}
      {children && (
        <details className={styles.details}>
          <summary>{t('aiLab.interview.report.transcriptTitle')}</summary>
          <div>{children}</div>
        </details>
      )}
      {requestId && (
        <p className={styles.reference}>
          {t('aiLab.interview.problem.reference', { id: requestId })}
        </p>
      )}
    </section>
  );
}
