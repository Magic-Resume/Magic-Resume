import React from 'react';
import { InfoType } from '../types/resume';
import { Globe, Mail, MapPin, Phone } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { Editable } from '../renderer/EditableCanvas';
import { safeHref } from './utils';
import { sectionIconByName } from '../sectionIcons';

interface Props {
  data: InfoType;
  style?: React.CSSProperties;
  className?: string;
  avatarPosition?: 'left' | 'right';
  avatarWidth?: number;
  avatarHeight?: number;
  avatarRounded?: boolean;
  contactStyle?: 'icon' | 'label';
  showCustomFields?: boolean;
}

const ContactIcons = {
  location: <MapPin className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
  phone: <Phone className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
  email: <Mail className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
  website: <Globe className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />
};

export const Header = React.memo(function Header({
  data: info,
  style,
  className,
  avatarPosition = 'left',
  avatarWidth = 40,
  avatarHeight = 40,
  avatarRounded = true,
  contactStyle = 'icon',
  // 自定义基本信息是 Resume 的通用数据，不应只在两个示例模板里可见。
  // 模板仍可显式传 false，给极简版式保留收起的选择。
  showCustomFields = true,
}: Props) {
  const { t } = useTranslation();
  const avatarClassName = avatarRounded
    ? 'rounded-full'
    : 'rounded-md';

  const isRightAvatarLayout = avatarPosition === 'right';

  const avatarNode = info.avatar ? (
    // 原生 img:头像可能是 R2 URL / 自定义域名 / data:URL,不走 next/image
    // 的域名白名单,任意来源都能渲染(与 PDF/表单预览一致)。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={info.avatar}
      alt={t('basicForm.avatarAlt')}
      width={avatarWidth}
      height={avatarHeight}
      className={`${avatarClassName} object-cover border shrink-0`}
      style={{
        width: `${avatarWidth}px`,
        height: `${avatarHeight}px`,
        background: 'var(--color-background)',
        borderColor: 'var(--color-border)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
      }}
    />
  ) : null;

  const contactItems: Array<{
    key: string;
    icon: React.ReactElement;
    label: string;
    content: string;
    href?: string;
    external?: boolean;
  }> = [];

  if (info.phoneNumber) {
    contactItems.push({
      key: 'phone',
      icon: ContactIcons.phone,
      label: t('basicForm.fields.phoneNumber'),
      content: info.phoneNumber,
      href: `tel:${info.phoneNumber}`,
    });
  }
  if (info.email) {
    contactItems.push({
      key: 'email',
      icon: ContactIcons.email,
      label: t('basicForm.fields.email'),
      content: info.email,
      href: `mailto:${info.email}`,
    });
  }
  if (info.address) {
    contactItems.push({
      key: 'address',
      icon: ContactIcons.location,
      label: t('basicForm.fields.address'),
      content: info.address,
    });
  }
  if (info.website) {
    const websiteHref = safeHref(info.website);
    contactItems.push({
      key: 'website',
      icon: ContactIcons.website,
      label: t('basicForm.fields.website'),
      content: info.website,
      href: websiteHref ?? undefined,
      external: Boolean(websiteHref),
    });
  }

  const customFieldItems = (showCustomFields ? (info.customFields || []) : [])
    .filter(field => field && field.name?.trim() && field.value?.trim())
    .map((field, index) => {
      const value = field.value.trim();
      const href = safeHref(value) ?? undefined;
      const Icon = sectionIconByName(field.icon);
      return {
        key: field.id || `custom-${index}`,
        custom: true as const,
        label: field.name.trim(),
        content: value,
        href,
        external: Boolean(href),
        ...(Icon
          ? {
              icon: <Icon className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
            }
          : {}),
      };
    });
  return (
    <div 
      className={`flex items-start justify-between gap-4 ${className || ''}`} 
      style={{
        ...style,
        lineHeight: 'var(--line-height)',
        letterSpacing: 'var(--letter-spacing)',
        fontFamily: 'var(--font-family-primary)',
      }}
    >
      {avatarPosition === 'left' && avatarNode}
      <div className="space-y-1 flex-1 min-w-0">
        <div
          className={contactStyle === 'label' ? 'text-xl font-bold' : (isRightAvatarLayout ? 'text-base font-bold' : 'text-sm font-bold')}
          style={{ color: 'var(--color-text)' }}
        >
          {info.fullName || t('resumePreview.yourName')}
        </div>
        {info.headline && (
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <Editable
              target={{ sectionKey: 'info', itemId: '', fieldKey: 'headline', kind: 'text', label: '个人摘要' }}
              text={info.headline}
            />
          </div>
        )}
        {contactStyle === 'label' ? (
          <div
            className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]"
            style={{
              lineHeight: 'var(--line-height)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {[...contactItems, ...customFieldItems].map(item => (
              <div key={item.key} className="truncate" style={{ color: 'var(--color-text)' }}>
                {'custom' in item && item.icon ? (
                  <span className="mr-1 inline-flex align-middle">{item.icon}</span>
                ) : null}
                <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}：</span>
                {item.href ? (
                  <a
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer noopener nofollow" : undefined}
                    style={{ color: 'var(--color-text)' }}
                  >
                    {item.content}
                  </a>
                ) : (
                  item.content
                )}
              </div>
            ))}
          </div>
        ) : (
          <div 
            className={`flex flex-wrap items-center gap-y-1 ${isRightAvatarLayout ? 'gap-x-1.5 text-[11px]' : 'gap-x-2 text-[10px]'}`}
            style={{ 
              lineHeight: 'var(--line-height)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {[...contactItems, ...customFieldItems].map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && (
                  <span style={{ color: 'var(--color-border)' }}>|</span>
                )}
                {'icon' in item ? (
                  <div className="flex items-center gap-x-1">
                    <div className="flex items-center">{item.icon}</div>
                    {item.href ? (
                      <a
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noreferrer noopener nofollow" : undefined}
                        style={{ color: 'var(--color-text)' }}
                      >
                        {item.content}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--color-text)' }}>{item.content}</span>
                    )}
                  </div>
                ) : (
                  <span style={{ color: 'var(--color-text)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{item.label}：</span>
                    {item.href ? (
                      <a
                        href={item.href}
                        target={item.external ? "_blank" : undefined}
                        rel={item.external ? "noreferrer noopener nofollow" : undefined}
                        style={{ color: 'var(--color-text)' }}
                      >
                        {item.content}
                      </a>
                    ) : (
                      item.content
                    )}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      {avatarPosition === 'right' && <div className="shrink-0">{avatarNode}</div>}
    </div>
  );
});
