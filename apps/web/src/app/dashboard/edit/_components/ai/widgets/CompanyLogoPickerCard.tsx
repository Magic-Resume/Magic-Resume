'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Image as ImageIcon, Link, X } from '@magic-resume/icons';
import { WidgetItem, WidgetShell } from '@magic-resume/genui/motion';
import type { WidgetProps } from '@magic-resume/genui/contract';
import { cn } from '@/lib/utils';

export interface CompanyLogoChoice {
  name: string;
  candidates: string[];
}

interface CandidateMeta {
  type?: 'symbol' | 'icon' | 'logo';
  format: string;
  theme?: string;
}

function candidateMeta(url: string): CandidateMeta {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split('/').pop() ?? '';
    const format = filename.split('.').pop()?.toUpperCase() || '';
    const match = filename.match(/^(symbol|icon|logo)-(light|dark|default)-/i);
    return {
      format,
      ...(match?.[1] ? { type: match[1].toLowerCase() as CandidateMeta['type'] } : {}),
      ...(match?.[2] && match[2] !== 'default' ? { theme: match[2].toLowerCase() } : {}),
    };
  } catch {
    return { format: '' };
  }
}

const initialSelections = (companies: CompanyLogoChoice[]): Record<string, string> =>
  Object.fromEntries(companies.map((company) => [company.name, company.candidates[0] ?? '']));

export default function CompanyLogoPickerCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as {
    title?: string;
    message?: string;
    companies?: CompanyLogoChoice[];
    skippable?: boolean;
  };
  const companies = props.companies ?? [];
  const [values, setValues] = useState<Record<string, string>>(() => initialSelections(companies));
  const [manual, setManual] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(companies.map((company) => [company.name, company.candidates.length === 0])),
  );
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const resolved = instance.status !== 'pending';
  const selectedCount = Object.values(values).filter((value) => value.trim()).length;

  const selectCandidate = (company: string, url: string) => {
    setValues((current) => ({ ...current, [company]: url }));
    setManual((current) => ({ ...current, [company]: false }));
  };

  const selectManual = (company: string) => {
    setManual((current) => ({ ...current, [company]: true }));
    setValues((current) => ({ ...current, [company]: '' }));
  };

  return (
    <WidgetShell
      surface={false}
      width="wide"
      className="overflow-hidden rounded-2xl bg-surface shadow-card"
    >
      <div className="flex h-11 items-center gap-2.5 px-3.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent-tint text-accent-ink">
          <ImageIcon size={13} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {props.title || t('aiLab.widgets.companyLogos.title')}
        </span>
        {resolved ? (
          <span
            className={cn(
              'inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px]',
              instance.status === 'submitted' ? 'bg-green-tint text-green' : 'bg-hover text-ink-3',
            )}
          >
            {instance.status === 'submitted' ? <Check size={11} /> : <X size={11} />}
            {instance.status === 'submitted'
              ? t('aiLab.widgets.companyLogos.submitted')
              : t('aiLab.widgets.companyLogos.skipped')}
          </span>
        ) : null}
      </div>

      <div
        inert={resolved || undefined}
        aria-hidden={resolved || undefined}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          resolved ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {props.message ? (
            <p className="px-3.5 pb-2 text-[11.5px] leading-4 text-ink-3">{props.message}</p>
          ) : null}

          <div className="divide-y divide-line">
            {companies.map((company) => (
              <WidgetItem key={company.name} className="px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="truncate text-[12px] font-medium text-ink">{company.name}</span>
                  <span className="shrink-0 text-[10.5px] text-ink-3">
                    {company.candidates.length
                      ? t('aiLab.widgets.companyLogos.candidateCount', {
                          count: company.candidates.length,
                        })
                      : t('aiLab.widgets.companyLogos.noCandidates')}
                  </span>
                </div>

                <div className="flex flex-wrap items-start gap-2">
                  {company.candidates.map((url, index) => {
                    const meta = candidateMeta(url);
                    const selected = !manual[company.name] && values[company.name] === url;
                    const broken = failed.has(url);
                    return (
                      <button
                        key={url}
                        type="button"
                        disabled={broken}
                        aria-pressed={selected}
                        onClick={() => selectCandidate(company.name, url)}
                        className={cn(
                          'group relative w-[58px] rounded-xl border p-1.5 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.98]',
                          selected
                            ? 'border-accent bg-accent-tint'
                            : 'border-line bg-inset hover:border-line-strong hover:bg-hover',
                          broken && 'cursor-not-allowed opacity-40',
                        )}
                      >
                        <span
                          className={cn(
                            'relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg',
                            meta.theme === 'dark' ? 'bg-neutral-900' : 'bg-white',
                          )}
                        >
                          {!loaded.has(url) && !broken ? (
                            <span className="absolute inset-0 animate-pulse bg-hover" />
                          ) : null}
                          {broken ? (
                            <ImageIcon size={15} className="text-ink-3" />
                          ) : (
                            // Brandfetch assets are display-only here; PDF byte access goes through
                            // the same-origin proxy in the renderer.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt=""
                              onLoad={() => setLoaded((current) => new Set(current).add(url))}
                              onError={() => setFailed((current) => new Set(current).add(url))}
                              className={cn(
                                'size-full object-contain p-1 transition-opacity duration-200',
                                loaded.has(url) ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                          )}
                          {selected ? (
                            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-accent text-white shadow-hairline">
                              <Check size={9} strokeWidth={3} />
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate px-0.5 text-center text-[9.5px] text-ink-3">
                          {meta.type
                            ? t(`aiLab.widgets.companyLogos.type.${meta.type}`)
                            : t('aiLab.widgets.companyLogos.version', { index: index + 1 })}
                          {' · '}
                          {meta.format || t('aiLab.widgets.companyLogos.type.image')}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    aria-pressed={manual[company.name]}
                    onClick={() => selectManual(company.name)}
                    className={cn(
                      'grid h-[58px] w-[58px] place-items-center rounded-xl border transition-[border-color,background-color,transform] duration-200 active:scale-[0.98]',
                      manual[company.name]
                        ? 'border-accent bg-accent-tint text-accent-ink'
                        : 'border-line bg-inset text-ink-3 hover:border-line-strong hover:bg-hover hover:text-ink-2',
                    )}
                  >
                    <span className="flex flex-col items-center gap-1 text-[9.5px]">
                      <Link size={13} />
                      {t('aiLab.widgets.companyLogos.custom')}
                    </span>
                  </button>
                </div>

                {manual[company.name] ? (
                  <div className="mt-2">
                    <label
                      htmlFor={`${instance.widgetId}:${company.name}`}
                      className="mb-1 block text-[10.5px] text-ink-3"
                    >
                      {t('aiLab.widgets.companyLogos.imageUrl')}
                    </label>
                    <input
                      id={`${instance.widgetId}:${company.name}`}
                      type="url"
                      value={values[company.name] ?? ''}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [company.name]: event.target.value,
                        }))
                      }
                      placeholder={t('aiLab.widgets.companyLogos.urlPlaceholder')}
                      className="h-8 w-full rounded-lg border border-line bg-inset px-2.5 text-[11.5px] text-ink outline-none placeholder:text-ink-3 focus:border-line-strong"
                    />
                  </div>
                ) : null}
              </WidgetItem>
            ))}
          </div>

          <WidgetItem className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className="text-[10.5px] text-ink-3">
              {t('aiLab.widgets.companyLogos.selected', {
                selected: selectedCount,
                total: companies.length,
              })}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onAction({ type: 'cancel' })}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-[11.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                {props.skippable
                  ? t('aiLab.widgets.companyLogos.skip')
                  : t('aiLab.widgets.companyLogos.cancel')}
              </button>
              <button
                type="button"
                onClick={() => onAction({ type: 'submit', values })}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-[11.5px] font-medium text-white transition-[background-color,transform] hover:bg-accent/90 active:scale-[0.98]"
              >
                <Check size={12} />
                {t('aiLab.widgets.companyLogos.confirm')}
              </button>
            </div>
          </WidgetItem>
        </div>
      </div>
    </WidgetShell>
  );
}
