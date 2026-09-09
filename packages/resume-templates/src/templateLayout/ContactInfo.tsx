import React from 'react';
import { InfoType } from '../types/resume';
import { Globe, Mail, MapPin, Phone, type LucideIcon } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { safeHref } from './utils';
import { sectionIconByName, type SectionIconComponent } from '../sectionIcons';

interface Props {
  data: InfoType;
  style?: React.CSSProperties;
  position?: {
    area?: 'main' | 'sidebar' | 'header' | 'footer';
  };
}

type ContactItem = {
  key: string;
  icon?: LucideIcon | SectionIconComponent;
  label?: string;
  value: string;
  href: string | null;
};

export const ContactInfo = React.memo(function ContactInfo({ data: info, style, position }: Props) {
  const { t } = useTranslation();
  const isInSidebar = position?.area === 'sidebar';
  const contactItems: ContactItem[] = [
    { key: 'address', icon: MapPin, value: info.address, href: null },
    { key: 'phone', icon: Phone, value: info.phoneNumber, href: `tel:${info.phoneNumber}` },
    { key: 'email', icon: Mail, value: info.email, href: `mailto:${info.email}` },
    { key: 'website', icon: Globe, value: info.website, href: safeHref(info.website) },
    ...(info.customFields ?? [])
      .filter((field) => field?.name?.trim() && field.value?.trim())
      .map((field, index) => {
        const Icon = sectionIconByName(field.icon);
        return {
          key: field.id || `custom-${index}`,
          label: field.name.trim(),
          value: field.value.trim(),
          href: safeHref(field.value) ?? null,
          ...(Icon ? { icon: Icon } : {}),
        };
      }),
  ].filter(item => item.value);

  if (contactItems.length === 0) return null;

  const textColor = style?.color || (isInSidebar ? 'var(--color-background)' : 'var(--color-text)');
  const iconColor = style?.color
    ? `${style.color}cc`
    : (isInSidebar ? 'var(--color-background)' : 'var(--color-primary)');

  return (
    <div 
      style={{
        ...style,
        lineHeight: 'var(--line-height)',
        letterSpacing: 'var(--letter-spacing)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--paragraph-spacing)',
      }}
    >
      <h3 
        className="text-sm font-bold uppercase tracking-wide" 
        style={{ 
          color: textColor,
          paddingBottom: 'var(--section-title-spacing)',
          borderBottomWidth: 'var(--title-divider-width)',
          borderBottomStyle: 'solid',
          borderBottomColor: textColor,
          marginBottom: 'var(--section-title-spacing)',
        }}
      >
        {t('common.info.contact')}
      </h3>
      
      <div className="space-y-3">
        {contactItems.map((item) => {
          const IconComponent = item.icon;
          const content = (
            <div className="flex items-center space-x-3" style={{ color: textColor, lineHeight: 1.2 }}>
              {IconComponent ? (
                <IconComponent
                  className="w-4 h-4 shrink-0"
                  style={{ color: iconColor }}
                />
              ) : (
                <span className="w-4 shrink-0" aria-hidden />
              )}
              <span className="text-xs break-all">
                {item.label ? `${item.label}：` : null}{item.value}
              </span>
            </div>
          );

          if (item.href) {
            return (
              <a 
                key={item.key}
                href={item.href}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.href.startsWith('http') ? 'noreferrer noopener' : undefined}
                className="block transition-colors"
                style={{ color: textColor, opacity: 0.9 }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.9'}
              >
                {content}
              </a>
            );
          }

          return <div key={item.key}>{content}</div>;
        })}
      </div>
    </div>
  );
});
