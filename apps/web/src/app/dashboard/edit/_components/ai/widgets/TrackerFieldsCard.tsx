'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApprovalCard } from '@magic-resume/genui/beautiful';
import type { WidgetProps } from '@magic-resume/genui/contract';

/**
 * 建面板前问一句：这块板子要盯哪几件事。
 *
 * 走 `request_form` 的**中断**通道（不是 `push_ui`）——流停在这里等答案，用户不答就
 * 不建板。用 `push_ui` 的话流不会停，模型会自顾自往下建一块它猜出来的板。
 *
 * 选项就是 `BUILTIN_BOARD_COLUMNS`，键必须原样回给工具（后端按键存），所以这里显示
 * 的是译名、回传的是键。多选之外还留自由输入：用户想要「薪资范围」这种内置列没有的
 * 东西，那句话会原样交给模型，由它去加一列。
 */
const BOARD_FIELD_KEYS = [
  'company',
  'role',
  'status',
  'appliedAt',
  'nextActionAt',
  'sourceUrl',
  'location',
  'notes',
] as const;

/** 公司和岗位不进选项：没有它们的投递记录不成立，让人「选」等于给了一个假的选择。 */
const REQUIRED_KEYS = ['company', 'role'] as const;

export default function TrackerFieldsCard({ instance, onAction }: WidgetProps) {
  const { t } = useTranslation();
  const [answered, setAnswered] = useState<string | undefined>(
    instance.status === 'submitted' || instance.status === 'expired'
      ? t('aiLab.widgets.trackerFields.answered')
      : undefined,
  );

  const optional = BOARD_FIELD_KEYS.filter(
    (key) => !REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number]),
  );
  const labels = useMemo(
    () =>
      Object.fromEntries(
        optional.map((key) => [
          t(`aiLab.widgets.applicationTracker.columns.${key}`),
          key,
        ]),
      ),
    [t, optional],
  );

  const question = {
    q: t('aiLab.widgets.trackerFields.question'),
    type: 'check' as const,
    options: Object.keys(labels),
    answered,
  };

  return (
    <ApprovalCard
      questions={[question]}
      disabled={instance.status !== 'pending'}
      freeTextPlaceholder={t('aiLab.widgets.trackerFields.freeText')}
      labels={{
        previous: t('aiLab.widgets.trackerFields.previous'),
        next: t('aiLab.widgets.trackerFields.next'),
        send: t('aiLab.widgets.trackerFields.send'),
        goTo: t('aiLab.widgets.trackerFields.goTo'),
        freeText: t('aiLab.widgets.trackerFields.freeText'),
        freeTextAria: t('aiLab.widgets.trackerFields.freeText'),
      }}
      onAnswer={(_page, answer) => {
        // 认得的译名换回键，认不出的原样留着——那是用户自己敲的诉求，交给模型读。
        const keys: string[] = [...REQUIRED_KEYS];
        const notes: string[] = [];
        for (const entry of answer) {
          const key = labels[entry];
          if (key) keys.push(key);
          else notes.push(entry);
        }
        setAnswered(t('aiLab.widgets.trackerFields.answered'));
        onAction({
          type: 'submit',
          values: {
            visibleColumns: keys.join(','),
            ...(notes.length ? { note: notes.join('；') } : {}),
          },
        });
      }}
    />
  );
}
