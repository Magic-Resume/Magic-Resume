'use client';

import React from 'react';
import { CircleDot, Plus, Trash2 } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { SECTION_ICON_NAMES, sectionIconByName } from '@magic-resume/resume-templates';
import type { CustomInfoField } from '@/types/frontend/resume';
import { FieldLabel, fieldInputClass } from './fields';

type Props = {
  fields: CustomInfoField[];
  onChange: (fields: CustomInfoField[]) => void;
  title: string;
  /** Item-level custom fields do not have a visual slot for icons. */
  enableIcons?: boolean;
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
export default function CustomFieldsEditor({ fields, onChange, title, enableIcons = false }: Props) {
  const { t } = useTranslation();
  const [pickerFor, setPickerFor] = React.useState<string | null>(null);

  const patch = (id: string, key: 'name' | 'value' | 'icon', value: string | undefined) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, [key]: value } : f)));

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <FieldLabel>{title}</FieldLabel>
      <div className="flex flex-col gap-2">
        {fields.map((field) => (
          <div
            key={field.id}
            className="space-y-2"
          >
            <div className={`grid items-center gap-2 ${enableIcons ? 'grid-cols-[2.25rem_1fr_1fr_auto]' : 'grid-cols-[1fr_1fr_auto]'}`}>
              {enableIcons ? (() => {
                const Icon = sectionIconByName(field.icon);
                return (
                  <button
                    type="button"
                    aria-label={t('basicForm.customFields.iconButton')}
                    title={t('basicForm.customFields.iconButton')}
                    aria-expanded={pickerFor === field.id}
                    onClick={() => setPickerFor(pickerFor === field.id ? null : field.id)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                      Icon
                        ? 'border-sky-400/50 bg-sky-400/10 text-sky-300'
                        : 'border-white/10 bg-white/[0.04] text-neutral-500 hover:border-white/20 hover:text-neutral-200'
                    }`}
                  >
                    {Icon ? <Icon size={16} /> : <CircleDot size={16} />}
                  </button>
                );
              })() : null}
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

            {enableIcons && pickerFor === field.id ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <p className="mb-2 text-[11px] text-neutral-500">
                  {t('basicForm.customFields.iconLabel')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SECTION_ICON_NAMES.map((name) => {
                    const Icon = sectionIconByName(name);
                    if (!Icon) return null;
                    const active = field.icon === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-label={name}
                        aria-pressed={active}
                        onClick={() => {
                          patch(field.id, 'icon', active ? undefined : name);
                          setPickerFor(null);
                        }}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                          active
                            ? 'border-sky-400/50 bg-sky-400/10 text-sky-300'
                            : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:text-neutral-100'
                        }`}
                      >
                        <Icon size={15} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
