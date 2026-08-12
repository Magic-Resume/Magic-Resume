'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { RecommendationCard } from '@magic-resume/genui/beautiful';
import { WidgetShell } from '@magic-resume/genui';
import type { RecommendationOption } from '@magic-resume/genui/beautiful';
import type { WidgetProps } from '@magic-resume/genui/contract';

/**
 * 「我建议 A，也可以 B/C」——`ask_choice` 在模型确实有倾向时的形态。
 *
 * 与 `ChoiceCard` 的区别不是好看，是**表态**：主推项占满卡面并带上理由，其余收进抽屉。
 * 所以注册表只在模型给了 `recommended` 或任一选项带了理由/置信度时才路由到这里；
 * 没有倾向就该老老实实摆一排 chips（原则③：AI 是合作者，但不假装有主见）。
 *
 * 提交发的是 `{ choice: label }`——与 `ChoiceCard` 一字不差，所以 HITL 的 `edit`
 * 那条路一行都不用改。
 */
export default function RecommendationChoiceCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const props = instance.props as {
    message?: string;
    options?: RecommendationOption[];
    recommended?: number;
  };
  const options = props.options ?? [];
  if (!options.length) return null;

  const resolved = instance.status !== 'pending';

  return (
    <WidgetShell className="min-w-[280px] max-w-md flex-1">
      <RecommendationCard
        message={props.message ?? ''}
        options={options}
        recommended={props.recommended}
        // 从记录恢复的会话丢了「选的是哪个」，所以已答态只说「已选择」，不冒充某个选项。
        answered={
          instance.status === 'submitted' ? t('aiLab.widgets.form.submitted') : undefined
        }
        disabled={resolved}
        labels={{
          alternatives: t('aiLab.widgets.recommendation.alternatives'),
          others: t('aiLab.widgets.recommendation.others'),
          accept: t('aiLab.widgets.recommendation.accept'),
          accepted: t('aiLab.widgets.recommendation.accepted'),
          confidence: {
            high: t('aiLab.widgets.recommendation.confidence.high'),
            medium: t('aiLab.widgets.recommendation.confidence.medium'),
            low: t('aiLab.widgets.recommendation.confidence.low'),
            none: t('aiLab.widgets.recommendation.confidence.none'),
          },
        }}
        onAccept={(choice) => onAction({ type: 'submit', values: { choice } })}
      />
    </WidgetShell>
  );
}
