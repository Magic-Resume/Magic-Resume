'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import type { CustomInfoField } from '@/types/frontend/resume';
import { FieldLabel, fieldInputClass } from './fields';

type Props = {
  fields: CustomInfoField[];
  onChange: (fields: CustomInfoField[]) => void;
  title: string;
};

/**
 * Name/value pairs a user can add to a form.
 *
 * Lifted out of `BasicForm`, where it was written inline and gated to a single
 * template, so item forms can offer the same thing. A custom section is
 * whatever the candidate wrote — 获奖经历 wants an issuer, 开源贡献 wants stars
 * — and no fixed field list is going to anticipate that.
 *
 * These render through an explicit block in `ListSection` / `DefaultSection`
 * rather than through a template's fieldMap. That is the point: a key no
 * fieldMap declares is dropped silently by `getFieldValue`, which is exactly
 * how prose in `description` became invisible. A field the user typed has to
 * be a field the user can see.
 */
export default function CustomFieldsEditor({ fields, onChange, title }: Props) {
  const { t } = useTranslation();

  const patch = (id: string, key: 'name' | 'value', value: string) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [key]: value } : f)));

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <FieldLabel>{title}</FieldLabel>
      <div className="flex flex-col gap-2">
        {fields.map((field) => (
          <div
            key={field.id}
            className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
          >
            <input
              value={field.name}
              onChange={(e) => patch(field.id, 'name', e.target.value)}
              placeholder={t('basicForm.customFields.namePlaceholder')}
              className={fieldInputClass}
            />
            <input
              value={field.value}
              onChange={(e) => patch(field.id, 'value', e.target.value)}
              placeholder={t('basicForm.customFields.valuePlaceholder')}
              className={fieldInputClass}
            />
            <button
              type="button"
              onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
              aria-label={t('common.delete')}
              title={t('common.delete')}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-neutral-400 transition-colors duration-150 hover:border-red-500/40 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...fields, { id: nanoid(), name: '', value: '' }])}
        className="flex w-fit items-center gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-3 py-2 text-[12.5px] font-medium text-neutral-300 transition-colors duration-150 hover:border-sky-400/40 hover:text-white"
      >
        <Plus size={14} />
        {t('basicForm.customFields.addButton')}
      </button>
    </div>
  );
}
