'use client';

import React from 'react';
import { Building2, ExternalLink, MessageCircleQuestion } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { WidgetItem, WidgetShell } from '@magic-resume/genui';
import type { WidgetProps } from '@magic-resume/genui';

export type ResearchBriefVariant = 'company' | 'interview';

export interface ResearchBriefItem {
  text: string;
  url?: string;
  domain?: string;
  sourceName?: string;
  date?: string;
}

export interface ResearchBriefGroup {
  key: string;
  title?: string;
  accent: string;
  actionable?: boolean;
  items: ResearchBriefItem[];
}

/**
 * 公司研究和面试准备共用的「检索上下文卡」。每条事实都可以贴自己的外部来源，
 * 视觉上沿用 GenUI ContextCards 的来源胶囊，而不是把网址埋进一段 Markdown。
 */
export default function ResearchBriefCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as {
    variant?: ResearchBriefVariant;
    title?: string;
    groups?: ResearchBriefGroup[];
  };
  const variant = props.variant === 'interview' ? 'interview' : 'company';
  const groups = props.groups ?? [];
  if (!groups.length) return null;

  const sourceCount = groups.reduce(
    (count, group) => count + group.items.filter((item) => item.url).length,
    0,
  );
  const Icon = variant === 'interview' ? MessageCircleQuestion : Building2;

  return (
    <WidgetShell density="block">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-mr-accent-tint">
          <Icon size={14} className="text-mr-accent" />
        </div>
        <span className="min-w-0 flex-1 truncate text-mr-caption font-medium text-mr-ink">
          {props.title || t(`aiLab.widgets.${variant}Research.title`)}
        </span>
        {sourceCount > 0 ? (
          <span className="shrink-0 rounded-md bg-mr-sunk px-1.5 py-0.5 text-mr-micro tabular-nums text-mr-muted">
            {t('aiLab.sources.count', { count: sourceCount })}
          </span>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        {groups.map((group) => (
          <WidgetItem key={group.key}>
            <section className="overflow-hidden rounded-xl border border-mr-line bg-mr-sunk/55">
              <div className="flex items-center gap-2 border-b border-mr-line px-3 py-2">
                <span
                  className="h-3 w-1 rounded-full"
                  style={{ background: group.accent }}
                />
                <h3 className="text-mr-label font-medium text-mr-ink-secondary">
                  {t(`aiLab.widgets.${variant}Research.groups.${group.key}`, {
                    defaultValue: group.title || group.key,
                  })}
                </h3>
                <span className="ml-auto text-mr-micro tabular-nums text-mr-muted">
                  {group.items.length}
                </span>
              </div>

              <ul className="divide-y divide-hairline">
                {group.items.map((item, index) => (
                  <li key={`${group.key}-${index}`} className="px-3 py-2.5">
                    {group.actionable ? (
                      <button
                        type="button"
                        onClick={() =>
                          onAction({
                            type: 'submit',
                            values: {
                              follow_up: t('aiLab.widgets.research.followUp', {
                                item: item.text,
                              }),
                            },
                          })
                        }
                        className="w-full cursor-pointer text-left text-xs leading-relaxed text-mr-ink-secondary transition-colors hover:text-mr-ink"
                      >
                        {item.text}
                      </button>
                    ) : (
                      <p className="text-xs leading-relaxed text-mr-ink-secondary">
                        {item.text}
                      </p>
                    )}

                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-mr-surface px-2 py-1 text-mr-micro font-medium text-mr-muted shadow-sm transition-colors hover:text-mr-ink"
                        title={item.url}
                      >
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-mr-accent-tint text-mr-nano font-bold text-mr-accent">
                          {t('aiLab.widgets.research.sourceBadge')}
                        </span>
                        <span className="truncate">
                          {item.sourceName || item.domain || item.url}
                        </span>
                        {item.date ? (
                          <span className="shrink-0 opacity-70">
                            · {item.date}
                          </span>
                        ) : null}
                        <ExternalLink
                          size={9}
                          className="shrink-0"
                          aria-hidden
                        />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </WidgetItem>
        ))}
      </div>
    </WidgetShell>
  );
}
