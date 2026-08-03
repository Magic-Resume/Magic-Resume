import React from 'react';
import { getFieldValue } from './utils';
import { skillLevelToFraction } from './skill-level';

interface Item {
  [key: string]: unknown;
}

interface Props {
  title: string;
  items: Item[];
  fieldMap?: Record<string, string | string[]>;
  style?: React.CSSProperties;
  position?: {
    area?: 'main' | 'sidebar' | 'header' | 'footer';
  };
  titleIcon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  /** 把 level 文本画成进度条(如"精通"→满格),识别不了的等级回退成文字 */
  levelBar?: boolean;
}

export const CompactList = React.memo(function CompactList({ title, items, fieldMap = {}, style, position, titleIcon: TitleIcon, levelBar }: Props) {
  if (!items || items.length === 0) return null;

  const isInSidebar = position?.area === 'sidebar';
  
  const textColor = style?.color || (isInSidebar ? 'var(--color-background)' : 'var(--color-text)');
  const secondaryColor = style?.color ? `${style.color}cc` : 'var(--color-text-secondary)';

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
        className="font-bold uppercase tracking-wide" 
        style={{ 
          color: textColor,
          fontSize: 'var(--font-size-title)',
          paddingBottom: 'var(--section-title-spacing)',
          borderBottomWidth: 'var(--title-divider-width)',
          borderBottomStyle: 'solid',
          borderBottomColor: textColor,
          marginBottom: 'var(--section-title-spacing)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4em',
        }}
      >
        {TitleIcon && <TitleIcon style={{ display: 'var(--title-icon-display)', flexShrink: 0, width: '1em', height: '1em' }} />}
        {title}
      </h3>
      
      <ul 
        className="list-none"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--paragraph-spacing)',
        }}
      >
        {items.map((item, idx) => {
          const name = getFieldValue(item, fieldMap.title || ['name', 'skill', 'language', 'certificate']);
          const level = getFieldValue(item, fieldMap.level || 'level');
          const frac = levelBar ? skillLevelToFraction(level) : null;
          const trackColor = isInSidebar ? 'rgba(255,255,255,0.22)' : 'var(--color-border)';
          const fillColor = isInSidebar ? 'var(--color-background)' : 'var(--color-primary)';

          return (
            <li key={idx} style={{ color: textColor }}>
              <div className="font-medium" style={{ fontSize: 'var(--font-size-body)' }}>
                {name}
              </div>
              {frac !== null ? (
                <div style={{ marginTop: 4, height: 5, borderRadius: 3, background: trackColor, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(frac * 100)}%`, height: '100%', borderRadius: 3, background: fillColor }} />
                </div>
              ) : level ? (
                <div className="mt-1" style={{ color: secondaryColor, fontSize: 'var(--font-size-body)' }}>
                  {level}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
