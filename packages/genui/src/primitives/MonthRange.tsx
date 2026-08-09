'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { MiniSelect } from './MiniSelect';

const SEP = ' - ';

/**
 * Written into the resume itself, so it follows the resume's language, not the
 * UI's. The host passes the right word; these are only what we can recognise
 * when re-reading a value we (or the agent) wrote earlier.
 */
const KNOWN_PRESENT = ['至今', '现在', 'Present', 'present', 'Now'];

/** "2022.03" → { year: '2022', month: '03' }; anything else → empty. */
function splitPoint(raw: string): { year: string; month: string } {
  const m = /^(\d{4})[.\-/](\d{1,2})$/.exec(raw.trim());
  return m ? { year: m[1], month: m[2].padStart(2, '0') } : { year: '', month: '' };
}

function parse(value: string, presentLabel: string) {
  const [rawStart = '', rawEnd = ''] = value.split(SEP);
  const tail = rawEnd.trim();
  const ongoing = tail === presentLabel || KNOWN_PRESENT.includes(tail);
  return {
    start: splitPoint(rawStart),
    end: ongoing ? { year: '', month: '' } : splitPoint(rawEnd),
    ongoing,
  };
}

function join(
  start: { year: string; month: string },
  end: { year: string; month: string },
  ongoing: boolean,
  presentLabel: string,
): string {
  const left = start.year && start.month ? `${start.year}.${start.month}` : '';
  const right = ongoing ? presentLabel : end.year && end.month ? `${end.year}.${end.month}` : '';
  if (!left && !right) return '';
  return `${left}${SEP}${right}`;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function Point({
  value,
  years,
  disabled,
  labels,
  onChange,
}: {
  value: { year: string; month: string };
  years: string[];
  disabled?: boolean;
  labels: { year: string; month: string };
  onChange: (next: { year: string; month: string }) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <MiniSelect
        value={value.year}
        options={years}
        placeholder={labels.year}
        ariaLabel={labels.year}
        disabled={disabled}
        onChange={(year) => onChange({ ...value, year })}
      />
      <MiniSelect
        value={value.month}
        options={MONTHS}
        placeholder={labels.month}
        ariaLabel={labels.month}
        disabled={disabled}
        widthClass="w-[68px]"
        onChange={(month) => onChange({ ...value, month })}
      />
    </div>
  );
}

/**
 * A date span as the resume stores it — one string like "2022.03 - 2024.06".
 *
 * Two year/month selects rather than a calendar: résumé dates are month
 * granularity, so a day grid would make the user pick a number that never gets
 * used. "至今" is a checkbox because it is the common case for a current job
 * and typing it is exactly the sort of keystroke this card exists to remove.
 */
export function MonthRange({
  value,
  onChange,
  presentLabel,
  currentYear = new Date().getFullYear(),
}: {
  value: string;
  onChange: (next: string) => void;
  /** the word written into the resume for an ongoing span; defaults to the UI language's. */
  presentLabel?: string;
  currentYear?: number;
}) {
  const { t } = useTranslation();
  const present = presentLabel || t('aiLab.widgets.field.present');
  // 空态要说明这个框是干什么的——原生 select 空值时只是个空框。
  const labels = {
    year: t('aiLab.widgets.field.year'),
    month: t('aiLab.widgets.field.month'),
  };
  const { start, end, ongoing } = parse(value, present);
  const years = Array.from({ length: 45 }, (_, i) => String(currentYear + 1 - i));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Point
        value={start}
        years={years}
        labels={labels}
        onChange={(next) => onChange(join(next, end, ongoing, present))}
      />
      <span className="text-xs text-muted">–</span>
      <Point
        value={end}
        years={years}
        disabled={ongoing}
        labels={labels}
        onChange={(next) => onChange(join(start, next, false, present))}
      />
      <label className="inline-flex items-center gap-1.5 text-xs text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={ongoing}
          onChange={(e) => onChange(join(start, end, e.target.checked, present))}
          className="accent-[var(--fill-sky)] cursor-pointer"
        />
        {present}
      </label>
    </div>
  );
}
