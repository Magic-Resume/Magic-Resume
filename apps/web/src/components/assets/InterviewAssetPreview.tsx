'use client';

import React, { useEffect, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import InterviewReportView, {
  countSubstantiveAnswers,
} from '@/app/dashboard/interview/_components/InterviewReportView';
import {
  interviewApi,
  type ArchivedInterviewDetail,
} from '@/lib/api/interviewApi';

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; interview: ArchivedInterviewDetail }
  | { status: 'error'; missing: boolean };

/** Read the persisted archive; opening an asset must never generate a new report. */
export default function InterviewAssetPreview({ sessionId }: { sessionId?: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<PreviewState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setState({ status: 'error', missing: true });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    interviewApi.archived(sessionId).then(
      (interview) => {
        if (active) setState({ status: 'ready', interview });
      },
      (error: { response?: { status?: number } }) => {
        if (active) {
          setState({ status: 'error', missing: error?.response?.status === 404 });
        }
      },
    );
    return () => { active = false; };
  }, [sessionId, attempt]);

  if (state.status === 'loading') {
    return (
      <div className="max-w-[68ch] space-y-4 py-2" role="status" aria-busy="true" aria-label={t('aiLab.assets.interviewLoading')}>
        {[40, 92, 78, 85, 60].map((width, i) => (
          <div key={i} className="h-3 rounded bg-mr-surface-muted motion-safe:animate-pulse" style={{ width: `${width}%` }} />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-center gap-3 py-2">
        <p role="status" className="text-mr-caption text-ink-3">
          {t(state.missing ? 'aiLab.assets.previewMissing' : 'aiLab.assets.interviewLoadFailed')}
        </p>
        {!state.missing && (
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="rounded-full bg-surface px-3 py-1.5 text-mr-ui text-ink shadow-btn transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
            {t('aiLab.assets.retry')}
          </button>
        )}
      </div>
    );
  }

  const { interview } = state;
  if (!interview.report) {
    return (
      <div className="max-w-[68ch] space-y-6">
        <p className="text-mr-caption text-ink-3">{t('aiLab.interview.report.archivedWithoutReportBody')}</p>
        <InterviewTranscript transcript={interview.transcript} />
      </div>
    );
  }

  const answered = countSubstantiveAnswers(interview.transcript.map((turn) => ({
    role: turn.role === 'assistant' ? 'interviewer' : 'candidate',
    text: turn.content,
  })));
  const tabClassName = 'relative cursor-pointer whitespace-nowrap px-0.5 pb-3 text-mr-caption font-medium text-ink-3 outline-none transition-colors duration-150 hover:text-ink data-[selected]:text-ink data-[focus-visible]:rounded-sm data-[focus-visible]:outline-2 data-[focus-visible]:outline-accent-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink after:opacity-0 after:transition-opacity data-[selected]:after:opacity-100';

  return (
    <Tabs key={interview.id} defaultSelectedKey="report" className="max-w-[68ch]">
      <TabList aria-label={t('aiLab.assets.interviewContent')} className="mb-7 flex gap-6 border-b border-line">
        <Tab id="report" className={tabClassName}>{t('aiLab.interview.report.title')}</Tab>
        <Tab id="transcript" className={tabClassName}>{t('aiLab.assets.interviewTranscript')}</Tab>
      </TabList>
      <TabPanel id="report" className="outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink">
        <InterviewReportView report={interview.report} answered={answered} />
      </TabPanel>
      <TabPanel id="transcript" className="outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink">
        <InterviewTranscript transcript={interview.transcript} />
      </TabPanel>
    </Tabs>
  );
}

function InterviewTranscript({ transcript }: Pick<ArchivedInterviewDetail, 'transcript'>) {
  const { t } = useTranslation();
  if (transcript.length === 0) {
    return <p role="status" className="text-mr-caption text-ink-3">{t('aiLab.assets.interviewTranscriptEmpty')}</p>;
  }
  return (
    <ol aria-label={t('aiLab.assets.interviewTranscript')} className="space-y-6">
      {transcript.map((turn, index) => (
        <li key={index} className="space-y-2">
          <p className={`text-mr-label font-medium ${turn.role === 'assistant' ? 'text-accent-ink' : 'text-ink-3'}`}>
            {t(turn.role === 'assistant' ? 'aiLab.interview.interviewer' : 'aiLab.interview.you')}
          </p>
          <p className="whitespace-pre-wrap break-words text-mr-body-tight leading-relaxed text-ink">{turn.content}</p>
        </li>
      ))}
    </ol>
  );
}
