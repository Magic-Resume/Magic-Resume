'use client';

import React, { useMemo } from 'react';
import { BriefcaseBusiness, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WidgetShell } from '@magic-resume/genui';
import { FilterTable } from '@magic-resume/genui/beautiful';
import type {
  FilterTableFilter,
  FilterTablePill,
  FilterTableRow,
} from '@magic-resume/genui/beautiful';
import type { WidgetProps } from '@magic-resume/genui/contract';

export const APPLICATION_STATUSES = [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationTrackerItem {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  sourceUrl?: string;
  location?: string;
  appliedAt?: string;
  nextActionAt?: string;
  updatedAt?: string;
}

const STATUS_DOTS: Record<ApplicationStatus, string> = {
  SAVED: '#94a3b8',
  APPLIED: '#38bdf8',
  SCREENING: '#22d3ee',
  INTERVIEW: '#a78bfa',
  OFFER: '#34d399',
  ACCEPTED: '#10b981',
  REJECTED: '#fb7185',
  WITHDRAWN: '#94a3b8',
};

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  SAVED: 'bg-sunk text-tertiary',
  APPLIED: 'bg-tint-sky text-ink-sky',
  SCREENING: 'bg-tint-sky text-ink-sky',
  INTERVIEW: 'bg-orange-tint text-orange',
  OFFER: 'bg-green-tint text-green',
  ACCEPTED: 'bg-green-tint text-green',
  REJECTED: 'bg-red-tint text-red',
  WITHDRAWN: 'bg-sunk text-tertiary',
};

/** 投递列表沿用 Beautiful UI Filter Table：状态标签既是统计，也是即时筛选。 */
export default function ApplicationTrackerCard({ instance }: WidgetProps) {
  const { t, i18n } = useTranslation();
  const props = instance.props as { applications?: ApplicationTrackerItem[] };
  const applications = props.applications ?? [];

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: '2-digit',
      }),
    [i18n.language],
  );

  const counts = new Map<ApplicationStatus, number>();
  for (const application of applications) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }

  const filters: FilterTableFilter[] = [
    {
      key: 'all',
      label: t('aiLab.widgets.applicationTracker.filters.all'),
      count: applications.length,
    },
    ...APPLICATION_STATUSES.filter((status) => counts.has(status)).map(
      (status) => ({
        key: status,
        label: t(`aiLab.widgets.applicationTracker.status.${status}`),
        dot: STATUS_DOTS[status],
        count: counts.get(status) ?? 0,
      }),
    ),
  ];

  const pills = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [
      status,
      {
        label: t(`aiLab.widgets.applicationTracker.status.${status}`),
        className: STATUS_CLASSES[status],
      } satisfies FilterTablePill,
    ]),
  );

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
  };

  const rows: FilterTableRow[] = applications.map((application) => ({
    id: application.id,
    status: application.status,
    cells: {
      role: (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-primary">
            {application.role}
          </span>
          <span className="truncate text-[10px] text-tertiary">
            {application.company}
          </span>
        </span>
      ),
      date: formatDate(
        application.nextActionAt ||
          application.appliedAt ||
          application.updatedAt,
      ),
      source: application.sourceUrl ? (
        <a
          href={application.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-ink-sky hover:underline"
          title={application.sourceUrl}
        >
          {t('aiLab.widgets.applicationTracker.source')}
          <ExternalLink size={10} aria-hidden />
        </a>
      ) : (
        '—'
      ),
    },
  }));

  return (
    <WidgetShell className="min-w-[320px] max-w-xl flex-1 rounded-2xl bg-raised px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-tint-sky">
          <BriefcaseBusiness size={14} className="text-ink-sky" />
        </div>
        <span className="text-[13px] font-medium text-primary">
          {t('aiLab.widgets.applicationTracker.title')}
        </span>
      </div>
      {applications.length ? (
        <FilterTable
          filters={filters}
          columns={[
            {
              key: 'role',
              label: t('aiLab.widgets.applicationTracker.columns.role'),
            },
            {
              key: 'date',
              label: t('aiLab.widgets.applicationTracker.columns.date'),
            },
            {
              key: 'status',
              label: t('aiLab.widgets.applicationTracker.columns.status'),
            },
            {
              key: 'source',
              label: t('aiLab.widgets.applicationTracker.columns.source'),
            },
          ]}
          rows={rows}
          pills={pills}
          gridTemplateColumns="1.25fr .62fr .82fr .45fr"
          ariaLabel={t('aiLab.widgets.applicationTracker.ariaLabel')}
          className="max-w-none"
        />
      ) : (
        <div
          role="status"
          className="flex min-h-24 items-center gap-3 border-t border-line px-1"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk ring-1 ring-inset ring-line">
            <BriefcaseBusiness size={15} className="text-tertiary" />
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-primary">
              {t('aiLab.widgets.applicationTracker.emptyTitle')}
            </p>
            <p className="mt-0.5 max-w-[42ch] text-[11px] leading-relaxed text-tertiary">
              {t('aiLab.widgets.applicationTracker.emptyDescription')}
            </p>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
