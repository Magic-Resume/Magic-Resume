'use client';

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DOCUMENT_LANGUAGES,
  DOCUMENT_LANGUAGE_OPTIONS,
  resolveDocumentLanguage,
  type DocumentLanguage,
} from '@magic-resume/resume-schema';
import type { Resume } from '@/types/frontend/resume';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function DocumentLanguageField({
  resume,
  onChange,
}: {
  resume: Resume;
  onChange: (language: DocumentLanguage) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const language = resolveDocumentLanguage(resume);
  return (
    <div className="flex items-center justify-between gap-3">
      <label
        htmlFor={id}
        className="text-mr-caption text-mr-ink-secondary font-medium"
      >
        {t('templateCustomizer.documentLanguage.label')}
      </label>
      <Select
        value={language}
        onValueChange={(value) => onChange(value as DocumentLanguage)}
      >
        <SelectTrigger
          id={id}
          aria-label={t('templateCustomizer.documentLanguage.label')}
          size="sm"
          className="w-32 rounded-lg border-mr-line-soft bg-mr-surface-subtle px-3 text-mr-caption shadow-none transition-[background-color,border-color] duration-150 hover:bg-mr-surface-soft data-[state=open]:border-mr-line-strong data-[state=open]:bg-mr-surface-soft [&>svg]:transition-transform [&>svg]:duration-200 [&>svg]:ease-out data-[state=open]:[&>svg]:rotate-180 motion-reduce:[&>svg]:transition-none"
        >
          <SelectValue>
            {DOCUMENT_LANGUAGES.find((option) => option.value === language)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="w-40 rounded-xl border border-mr-line-strong bg-mr-surface p-1 shadow-mr-panel data-[state=open]:animate-mr-pop-in data-[state=closed]:animate-mr-fade-in data-[state=closed]:[animation-direction:reverse] data-[state=closed]:[animation-duration:120ms] data-[side=bottom]:translate-y-0 data-[side=top]:translate-y-0 motion-reduce:animate-none"
        >
          {DOCUMENT_LANGUAGE_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="min-h-8 cursor-pointer rounded-md pl-2.5 text-mr-caption text-mr-ink-secondary transition-colors duration-100 focus:bg-mr-surface-soft focus-visible:shadow-none data-[state=checked]:text-mr-ink"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
