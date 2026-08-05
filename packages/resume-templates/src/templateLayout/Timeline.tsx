import React from 'react';
import { getFieldValue, getFieldEntry } from './utils';
import { WysiwygContent } from './WysiwygContent';
import { Editable, SectionHandle, SectionInsertSlot } from '../renderer/EditableCanvas';

interface Item {
  [key: string]: unknown;
}

interface Props {
  title: string;
  items: Item[];
  fieldMap?: Record<string, string | string[]>;
  style?: React.CSSProperties;
  titleIcon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  /** resume section key — enables the editable canvas anchors */
  sectionKey?: string;
}

export const Timeline = React.memo(function Timeline({ title, items, fieldMap = {}, style, titleIcon: TitleIcon, sectionKey }: Props) {
  if (!items || items.length === 0) return null;

  const textColor = style?.color || 'var(--color-text)';
  const primaryColor = 'var(--color-primary)';
  const secondaryColor = style?.color ? `${style.color}80` : 'var(--color-text-secondary)';
  const timelineLineColor = 'var(--color-border)';

  return (
    <section 
      className="space-y-6"
      style={{
        ...style,
        maxWidth: '100%',
        minWidth: 0,
        lineHeight: 'var(--line-height)',
        letterSpacing: 'var(--letter-spacing)',
        marginBottom: 'var(--section-spacing)',
      }}
    >
      <h2 
        className="font-bold" 
        style={{ 
          color: textColor,
          fontSize: 'var(--font-size-title)',
          paddingBottom: 'var(--section-title-spacing)',
          borderBottomWidth: 'var(--title-divider-width)',
          borderBottomStyle: 'solid',
          borderBottomColor: primaryColor,
          marginBottom: 'var(--section-title-spacing)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4em',
        }}
      >
        {TitleIcon && <TitleIcon style={{ display: 'var(--title-icon-display)', flexShrink: 0, width: '1em', height: '1em' }} />}
        {title}
        {sectionKey && <SectionHandle sectionKey={sectionKey} title={title} />}
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--paragraph-spacing)' }}>
        {items.map((item, idx) => {
          const company = getFieldValue(item, fieldMap.title || ['company', 'school', 'name']);
          const position = getFieldValue(item, fieldMap.subtitle || ['position', 'degree', 'role']);
          const date = getFieldValue(item, fieldMap.date || 'date');
          const location = getFieldValue(item, ['location']);
          const description = getFieldEntry(item, fieldMap.description || ['summary', 'description']);
          const itemId = item.id != null ? String(item.id) : null;

          return (
            <div key={itemId || idx} className="relative min-w-0 max-w-full pl-6">
              <div 
                style={{
                  position: 'absolute',
                  left: '0px',
                  top: '0.5rem',
                  width: '0.75rem',
                  height: '0.75rem',
                  backgroundColor: primaryColor,
                  borderRadius: '9999px',
                  border: '2px solid var(--color-background)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
              />
              
              {idx < items.length - 1 && (
                <div 
                  style={{
                    position: 'absolute',
                    left: '5px',
                    top: '1.5rem',
                    width: '0.125rem',
                    height: '100%',
                    backgroundColor: timelineLineColor
                  }}
                />
              )}
              
              <div className="min-w-0 max-w-full space-y-2">
                <div className="flex min-w-0 max-w-full flex-col sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold" style={{ color: textColor, fontSize: 'var(--font-size-body)' }}>
                      {company}
                    </h3>
                    {position && (
                      <p className="font-medium" style={{ color: primaryColor, fontSize: 'var(--font-size-body)' }}>
                        {position}
                      </p>
                    )}
                    {location && (
                      <p style={{ color: secondaryColor, fontSize: 'var(--font-size-body)' }}>
                        {location}
                      </p>
                    )}
                  </div>
                  
                  {date && (
                    <div className="mt-1 shrink-0 font-medium sm:mt-0" style={{ color: secondaryColor, fontSize: 'var(--font-size-body)' }}>
                      {date}
                    </div>
                  )}
                </div>
                
                {description && (
                  <div className="min-w-0 max-w-full" style={{ color: textColor, fontSize: 'var(--font-size-body)' }}>
                    {sectionKey && itemId ? (
                      <Editable
                        target={{
                          sectionKey,
                          itemId,
                          fieldKey: description.key,
                          kind: 'html',
                          label: `${title} · 第 ${idx + 1} 条`,
                        }}
                        html={description.value}
                      />
                    ) : (
                      <WysiwygContent dirtyHtml={description.value} />
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {sectionKey && <SectionInsertSlot sectionKey={sectionKey} />}
      </div>
    </section>
  );
});
