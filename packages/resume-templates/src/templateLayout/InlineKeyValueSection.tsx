import React from 'react';
import { Editable, SectionHandle, SectionInsertSlot } from '../renderer/EditableCanvas';
import { getFieldEntry, getFieldValue } from './utils';
import { WysiwygContent } from './WysiwygContent';

interface Item {
  [key: string]: unknown;
}

interface Props {
  title: string;
  items: Item[];
  fieldMap: Record<string, string | string[]>;
  className?: string;
  style?: React.CSSProperties;
  titleClassName?: string;
  titleIcon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  sectionKey?: string;
  labelSuffix?: string;
}

const withSuffix = (value: string | null, suffix: string) => {
  if (!value) return '';
  return /[:：]$/.test(value) ? value : `${value}${suffix}`;
};

export const InlineKeyValueSection = React.memo(function InlineKeyValueSection({
  title,
  items,
  fieldMap,
  className,
  style,
  titleClassName,
  titleIcon: TitleIcon,
  sectionKey,
  labelSuffix = ':',
}: Props) {
  if (!items || items.length === 0) return null;

  return (
    <section
      className={`grid ${className || ''}`}
      style={{
        ...style,
        fontSize: 'var(--font-size-body)',
        lineHeight: 'var(--line-height)',
        letterSpacing: 'var(--letter-spacing)',
        marginBottom: 'var(--section-spacing)',
      }}
    >
      <h4
        className={titleClassName || 'font-bold'}
        style={{
          color: 'var(--color-primary)',
          fontSize: 'var(--font-size-title)',
          marginBottom: 'var(--section-title-spacing)',
          paddingBottom: 'var(--section-title-spacing)',
          borderBottomWidth: 'var(--title-divider-width)',
          borderBottomStyle: 'solid',
          borderBottomColor: 'var(--color-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4em',
        }}
      >
        {TitleIcon && <TitleIcon style={{ display: 'var(--title-icon-display)', flexShrink: 0, width: '1em', height: '1em' }} />}
        {title}
        {sectionKey && <SectionHandle sectionKey={sectionKey} title={title} />}
      </h4>
      <div className="grid" style={{ gap: 'var(--spacing-xs)' }}>
        {items.map((item, index) => {
          const itemId = item.id != null ? String(item.id) : null;
          const label = getFieldValue(item, fieldMap.itemName);
          const detail = getFieldEntry(item, fieldMap.summary)
            ?? getFieldEntry(item, fieldMap.itemDetail);

          return (
            <div key={itemId || index} className="flex min-w-0 max-w-full items-start gap-x-1">
              {label && (
                <div
                  className="shrink-0 font-bold"
                  style={{ maxWidth: '40%', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {withSuffix(label, labelSuffix)}
                </div>
              )}
              {detail && (
                <div
                  className="min-w-0 flex-1"
                  style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {sectionKey && itemId ? (
                    <Editable
                      target={{
                        sectionKey,
                        itemId,
                        fieldKey: detail.key,
                        kind: 'html',
                        label: `${title} · 第 ${index + 1} 条`,
                      }}
                      html={detail.value}
                    />
                  ) : (
                    <WysiwygContent dirtyHtml={detail.value} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {sectionKey && <SectionInsertSlot sectionKey={sectionKey} />}
      </div>
    </section>
  );
});
