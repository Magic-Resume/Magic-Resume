import React from 'react';
import { InfoType } from '../types/resume';
import { Globe, Mail, MapPin, Phone } from '@magic-resume/icons';

interface Props {
  data: InfoType;
  style?: React.CSSProperties;
  position?: {
    area?: 'main' | 'sidebar' | 'header' | 'footer';
  };
}

const ContactIcons = {
  location: <MapPin className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
  phone: <Phone className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
  email: <Mail className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />,
  website: <Globe className="w-2.5 h-2.5" style={{ color: 'var(--color-primary)' }} />
};

export const ProfileCard = React.memo(function ProfileCard({ data: info, style, position }: Props) {
  const isInSidebar = position?.area === 'sidebar';

  const textColor = style?.color || (isInSidebar ? 'var(--color-background)' : 'var(--color-text)');
  const subtitleColor = style?.color
    ? `${style.color}cc`
    : (isInSidebar ? 'rgba(255, 255, 255, 0.85)' : 'var(--color-text-secondary)');
  const borderColor = style?.color || 'var(--color-border)';

  if (isInSidebar) {
    return (
      <div 
        className="text-center"
        style={{
          ...style,
          lineHeight: 'var(--line-height)',
          letterSpacing: 'var(--letter-spacing)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--paragraph-spacing)',
        }}
      >
        {info.avatar && (
          <div className="flex justify-center">
            {/* 原生 img:任意来源头像都能渲染,不受 next/image 域名白名单限制 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={info.avatar}
              alt="Profile"
              width={120}
              height={120}
              className="w-30 h-30 rounded-full object-cover border-4 shadow-lg"
              style={{ borderColor }}
            />
          </div>
        )}
        
        <div className="space-y-2">
          <h1 className="text-xl font-bold" style={{ color: textColor }}>
            {info.fullName || 'Your Name'}
          </h1>
          
          {info.headline && (
            <p className="text-sm font-medium" style={{ color: subtitleColor }}>
              {info.headline}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="text-center py-8"
      style={{
        ...style,
        lineHeight: 'var(--line-height)',
        letterSpacing: 'var(--letter-spacing)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--section-spacing)',
      }}
    >
      {info.avatar && (
        <div className="flex justify-center">
          {/* 原生 img:任意来源头像都能渲染,不受 next/image 域名白名单限制 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={info.avatar}
            alt="Profile"
            width={120}
            height={120}
            className="w-30 h-30 rounded-full object-cover border-4 shadow-lg"
            style={{ borderColor }}
          />
        </div>
      )}
      
      <div className="space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: textColor }}>
          {info.fullName || 'Your Name'}
        </h1>
        
        {info.headline && (
          <p className="text-lg font-medium" style={{ color: subtitleColor }}>
            {info.headline}
          </p>
        )}
        
        <div className="text-sm flex flex-wrap justify-center gap-6 mt-6" style={{ color: subtitleColor }}>
          {info.email && (
            <div className="flex items-baseline gap-2">
              <div className="flex items-center justify-center w-4 h-4">
                <span className="text-sm leading-none">{ContactIcons.email}</span>
              </div>
              <span className="leading-4">{info.email}</span>
            </div>
          )}
          {info.phoneNumber && (
            <div className="flex items-baseline gap-2">
              <div className="flex items-center justify-center w-4 h-4">
                <span className="text-sm leading-none">{ContactIcons.phone}</span>
              </div>
              <span className="leading-4">{info.phoneNumber}</span>
            </div>
          )}
          {info.address && (
            <div className="flex items-baseline gap-2">
              <div className="flex items-center justify-center w-4 h-4">
                <span className="text-sm leading-none">{ContactIcons.location}</span>
              </div>
              <span className="leading-4">{info.address}</span>
            </div>
          )}
          {info.website && (
            <div className="flex items-baseline gap-2">
              <div className="flex items-center justify-center w-4 h-4">
                <span className="text-sm leading-none">{ContactIcons.website}</span>
              </div>
              <span className="leading-4">{info.website}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
