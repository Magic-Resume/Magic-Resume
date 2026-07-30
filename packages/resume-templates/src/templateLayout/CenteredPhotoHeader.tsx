import React from 'react';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import type { InfoType } from '../types/resume';
import { Editable } from '../renderer/EditableCanvas';
import { safeHref } from './utils';

interface Props {
  data: InfoType;
  style?: React.CSSProperties;
  className?: string;
  avatarWidth?: number;
  avatarHeight?: number;
  avatarRounded?: boolean;
  contactSeparator?: string;
  showCustomFields?: boolean;
}

type ContactItem = {
  key: string;
  value: string;
  href?: string;
  external?: boolean;
};

export const CenteredPhotoHeader = React.memo(function CenteredPhotoHeader({
  data: info,
  style,
  className,
  avatarWidth = 86,
  avatarHeight = 119,
  avatarRounded = false,
  contactSeparator = '|',
  showCustomFields = false,
}: Props) {
  const { t } = useTranslation();
  const contacts: ContactItem[] = [];

  if (info.phoneNumber) {
    contacts.push({ key: 'phone', value: info.phoneNumber, href: `tel:${info.phoneNumber}` });
  }
  if (info.email) {
    contacts.push({ key: 'email', value: info.email, href: `mailto:${info.email}` });
  }
  if (info.address) {
    contacts.push({ key: 'address', value: info.address });
  }
  if (info.website) {
    const href = safeHref(info.website) ?? undefined;
    contacts.push({ key: 'website', value: info.website, href, external: Boolean(href) });
  }
  if (showCustomFields) {
    for (const [index, field] of (info.customFields ?? []).entries()) {
      const value = field?.value?.trim();
      if (!value) continue;
      const href = safeHref(value) ?? undefined;
      contacts.push({
        key: field.id || `custom-${index}`,
        value,
        href,
        external: Boolean(href),
      });
    }
  }

  const avatar = info.avatar ? (
    <Image
      src={info.avatar}
      alt={t('basicForm.avatarAlt')}
      width={avatarWidth}
      height={avatarHeight}
      className={`${avatarRounded ? 'rounded-full' : 'rounded-none'} object-cover`}
      style={{
        width: `${avatarWidth}px`,
        height: `${avatarHeight}px`,
        background: 'var(--color-background)',
      }}
      unoptimized
    />
  ) : null;

  return (
    <div
      className={`grid items-start ${className || ''}`}
      style={{
        gridTemplateColumns: `${avatarWidth}px minmax(0, 1fr) ${avatarWidth}px`,
        columnGap: 'var(--spacing-md)',
        ...style,
        lineHeight: 'var(--line-height)',
        letterSpacing: 'var(--letter-spacing)',
        fontFamily: 'var(--font-family-primary)',
      }}
    >
      <div aria-hidden style={{ width: avatarWidth }} />
      <div className="min-w-0 text-center pt-1">
        <div
          className="font-bold"
          style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-xxl)' }}
        >
          {info.fullName || t('resumePreview.yourName')}
        </div>
        {contacts.length > 0 && (
          <div
            className="mt-2 flex flex-wrap items-center justify-center"
            style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-md)' }}
          >
            {contacts.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && (
                  <span className="mx-1" aria-hidden>{contactSeparator}</span>
                )}
                {item.href ? (
                  <a
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    rel={item.external ? 'noreferrer noopener nofollow' : undefined}
                    style={{ color: 'inherit' }}
                  >
                    {item.value}
                  </a>
                ) : (
                  <span>{item.value}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
        {info.headline && (
          <div
            className="mt-2"
            style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-lg)' }}
          >
            <Editable
              target={{ sectionKey: 'info', itemId: '', fieldKey: 'headline', kind: 'text', label: '个人摘要' }}
              text={info.headline}
            />
          </div>
        )}
      </div>
      <div className="flex justify-end" style={{ width: avatarWidth, minHeight: avatarHeight }}>
        {avatar}
      </div>
    </div>
  );
});
