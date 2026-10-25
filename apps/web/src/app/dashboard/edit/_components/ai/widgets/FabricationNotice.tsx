'use client';

import React from 'react';
import { ShieldAlert } from '@magic-resume-kit/icons';
import { useTranslation } from 'react-i18next';
import { WidgetItem, WidgetShell } from '@magic-resume/genui';
import type { WidgetProps } from '@magic-resume/genui';

/**
 * 反捏造闸门（确定性校验）标出的、简历改动里新冒出来的专有名词。
 *
 * 后端一直在算这个，但前端从来没有分支消费 `resume_verification` 事件——校验跑完就
 * 丢在地上了。它不拦截改动（原则③：AI 是合作者，改动先提案），只是把「这几个词
 * 你原文里没有」摆到用户眼前，由用户判断。
 */
/** 超过这个数就先收起：整面墙的标签会把对话挤走，前几个足够让用户知道要核对什么。 */
const VISIBLE_ITEMS = 8;

export default function FabricationNotice({ instance }: WidgetProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const props = instance.props as { items?: string[]; title?: string; body?: string };
  const items = Array.isArray(props.items) ? props.items : [];
  if (!items.length && !props.body) return null;
  const hidden = expanded ? 0 : Math.max(0, items.length - VISIBLE_ITEMS);
  const shown = hidden ? items.slice(0, VISIBLE_ITEMS) : items;

  return (
    <WidgetShell density="block">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/12">
          <ShieldAlert size={14} className="text-amber-400" />
        </div>
        <span className="text-mr-caption font-medium text-mr-ink">
          {props.title || t('aiLab.widgets.verification.title')}
        </span>
      </div>
      <WidgetItem className="mt-2 text-xs leading-relaxed text-mr-ink-secondary">
        {props.body || t('aiLab.widgets.verification.body')}
      </WidgetItem>
      {items.length ? (
        <WidgetItem className="mt-2.5 flex flex-wrap gap-1.5">
          {shown.map((item) => (
            <span
              key={item}
              className="rounded-md bg-amber-500/10 px-2 py-0.5 text-mr-label text-amber-300"
            >
              {item}
            </span>
          ))}
          {items.length > VISIBLE_ITEMS ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-md px-2 py-0.5 text-mr-label text-mr-ink-secondary transition-colors hover:text-mr-ink"
            >
              {hidden
                ? t('aiLab.widgets.verification.showMore', { count: hidden })
                : t('aiLab.widgets.verification.collapse')}
            </button>
          ) : null}
        </WidgetItem>
      ) : null}
    </WidgetShell>
  );
}
