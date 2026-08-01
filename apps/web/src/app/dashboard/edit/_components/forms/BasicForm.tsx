"use client";
import React from 'react';
import type { InfoType } from '@/types/frontend/resume';
import { useTranslation } from 'react-i18next';
import { TextField, AvatarField, FieldLabel } from './fields';
import CustomFieldsEditor from './CustomFieldsEditor';

type BasicFormProps = {
  info: InfoType;
  updateInfo: (info: Partial<InfoType>) => void;
  enableCustomFields?: boolean;
};

export default function BasicForm({
  info,
  updateInfo,
  enableCustomFields = false,
}: BasicFormProps) {
  const { t } = useTranslation();

  const customFields = info.customFields || [];

  const handleInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateInfo({ [e.target.name]: e.target.value });
  };

  type BasicField = {
    name: keyof Omit<InfoType, 'customFields'>;
    label: string;
    type?: string;
    placeholder?: string;
  };

  const textFields: BasicField[] = [
    { name: 'fullName', label: t('basicForm.fields.fullName') },
    { name: 'headline', label: t('basicForm.fields.headline') },
    { name: 'email', label: t('basicForm.fields.email'), type: 'email' },
    { name: 'website', label: t('basicForm.fields.website') },
    { name: 'phoneNumber', label: t('basicForm.fields.phoneNumber') },
    { name: 'address', label: t('basicForm.fields.address') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="avatar">{t('basicForm.fields.avatar')}</FieldLabel>
        <AvatarField
          value={info.avatar}
          onChange={handleInfoChange}
          onValueChange={(avatar) => updateInfo({ avatar })}
          alt={t('basicForm.avatarAlt')}
        />
      </div>

      {textFields.map((field) => (
        <TextField
          key={field.name}
          name={field.name}
          label={field.label}
          type={field.type}
          value={info[field.name]}
          onChange={handleInfoChange}
          placeholder={field.placeholder}
        />
      ))}

      {enableCustomFields && (
        <CustomFieldsEditor
          fields={customFields}
          onChange={(next) => updateInfo({ customFields: next })}
          title={t('basicForm.customFields.title')}
        />
      )}
    </div>
  );
}
