'use client';

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { WidgetItem, WidgetShell } from '@magic-resume/genui';
import type { WidgetProps } from '@magic-resume/genui/contract';

/**
 * 反捏造闸门（确定性校验）标出的、简历改动里新冒出来的专有名词。
 *
 * 后端一直在算这个，但前端从来没有分支消费 `resume_verification` 事件——校验跑完就
 * 丢在地上了。它不拦截改动（原则③：AI 是合作者，改动先提案），只是把「这几个词
 * 你原文里没有」摆到用户眼前，由用户判断。
 */
export default function FabricationNotice({ instance }: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as { items?: string[]; title?: string; body?: string };
  const items = Array.isArray(props.items) ? props.items : [];
  if (!items.length) return null;

  return (
    <WidgetShell className="min-w-[280px] max-w-md flex-1 rounded-2xl bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/12">
          <ShieldAlert size={14} className="text-amber-400" />
        </div>
        <span className="text-[13px] font-medium text-primary">
          {props.title || t('aiLab.widgets.verification.title')}
        </span>
      </div>
      <WidgetItem className="mt-2 text-xs leading-relaxed text-secondary">
        {props.body || t('aiLab.widgets.verification.body')}
      </WidgetItem>
      <WidgetItem className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300"
          >
            {item}
          </span>
        ))}
      </WidgetItem>
    </WidgetShell>
  );
}
