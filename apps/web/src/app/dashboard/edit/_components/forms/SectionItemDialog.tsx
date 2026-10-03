"use client";

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CustomInfoField } from '@/types/frontend/resume';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModalShell } from '@/components/ui/ModalShell';
import { EditorComponents } from '@/lib/utils/componentOptimization';
import CustomFieldsEditor from './CustomFieldsEditor';

const TiptapEditor = EditorComponents.TiptapEditor;
export type SectionItemField = { name: string; label: string; placeholder: string; required?: boolean };
export type EditableSectionItem = { id: string | number; visible?: boolean; [key: string]: unknown };

/** Shared by the sidebar and the canvas so both edit the same fields. Mount with the item's id as key. */
export default function SectionItemDialog<T extends EditableSectionItem>({
  open, initialItem, isEditing = false, label, fields, richtextKey = 'summary',
  richtextPlaceholder = '...', themeColor, onSave, onClose,
}: {
  open: boolean;
  initialItem: T;
  isEditing?: boolean;
  label: string;
  fields: SectionItemField[];
  richtextKey?: string;
  richtextPlaceholder?: string;
  themeColor?: string;
  onSave: (item: T) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [currentItem, setCurrentItem] = useState<T>(() => ({ ...initialItem }));
  const [isPolishing, setIsPolishing] = useState(false);
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentItem((item) => ({ ...item, [event.target.name]: event.target.value }));
  };
  const handleQuillChange = (content: string) => {
    setCurrentItem((item) => ({ ...item, [richtextKey]: content }));
  };
  const handleSave = () => {
    const requiredFieldNames = fields
      .filter(f => f.required)
      .map(f => f.name)
      .filter(f => f !== richtextKey);
    const missingFieldNames = requiredFieldNames.filter(fieldName => {
      const value = currentItem[fieldName];
      return typeof value !== 'string' || !value.trim();
    });

    if (missingFieldNames.length > 0) {
      const missingLabels = missingFieldNames
        .map(name => fields.find(f => f.name === name)?.label || name)
        .join(', ');
      toast.error(t('sections.notifications.requiredFields', { fields: missingLabels }));
      return;
    }

    onSave(currentItem);
  };

  return (
      <ModalShell
        open={open}
        onOpenChange={(open) => !open && onClose()}
        title={
          isEditing
            ? t('sections.shared.editTitle', { label })
            : t('sections.shared.addTitle', { label })
        }
        className="max-h-[88vh] w-[min(680px,92vw)]"
      >
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto scrollbar-hide px-6 py-6">
          {fields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name} className="text-mr-caption font-medium text-neutral-300">
                    {field.label}
                  </Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    placeholder={field.placeholder}
                    value={(currentItem?.[field.name] as string) || ''}
                    onChange={handleInputChange}
                    className="h-10 rounded-lg border border-white/[0.07] bg-sunk px-3.5 text-neutral-100 placeholder:text-neutral-600 transition-colors focus-visible:border-sky-500/40 focus-visible:ring-1 focus-visible:ring-sky-500/25 focus-visible:ring-offset-0"
                  />
                </div>
              ))}
            </div>
          )}
          <CustomFieldsEditor
            fields={(currentItem?.customFields as unknown as CustomInfoField[]) || []}
            onChange={(next) =>
              currentItem && setCurrentItem({ ...currentItem, customFields: next })
            }
            title={t('basicForm.customFields.title')}
          />
          <div className="space-y-2">
            <Label className="text-mr-caption font-medium text-neutral-300">
              {t('modals.dynamicForm.descriptionLabel')}
            </Label>
            <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-sunk transition-colors focus-within:border-sky-500/40 focus-within:ring-1 focus-within:ring-sky-500/25">
              <TiptapEditor
                content={(currentItem?.[richtextKey] as string) || ''}
                onChange={handleQuillChange}
                placeholder={richtextPlaceholder}
                isPolishing={isPolishing}
                setIsPolishing={setIsPolishing}
                themeColor={themeColor}
              />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-mr-line-soft px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-4 text-mr-caption text-neutral-400 transition-colors hover:bg-mr-surface-soft hover:text-neutral-100"
          >
            {t('modals.dynamicForm.cancelButton')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="h-9 rounded-lg bg-sky-500 px-5 text-mr-caption font-medium text-[#fff] transition-colors hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50"
          >
            {t('modals.dynamicForm.saveButton')}
          </button>
        </div>
      </ModalShell>
  );
}
