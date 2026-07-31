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
  columnRatio?: [number, number, number];
  shiftCenterToRightWhenRightEmpty?: boolean;
}

type ColumnValue = string | null;

const shiftCenterToEmptyRight = (
  values: [ColumnValue, ColumnValue, ColumnValue],
  enabled: boolean,
): [ColumnValue, ColumnValue, ColumnValue] => (
  enabled && values[1] && !values[2]
    ? [values[0], '', values[1]]
    : values
);

const breakableTextStyle: React.CSSProperties = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

export const ThreeColumnSection = React.memo(function ThreeColumnSection({
  title,
  items,
  fieldMap,
  className,
  style,
  titleClassName,
  titleIcon: TitleIcon,
  sectionKey,
  columnRatio = [1.65, 0.85, 1.15],
  shiftCenterToRightWhenRightEmpty = false,
}: Props) {
  if (!items || items.length === 0) return null;

  const columns = columnRatio.map((ratio) => `minmax(0, ${ratio}fr)`).join(' ');

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
      <div className="grid" style={{ gap: 'var(--paragraph-spacing)' }}>
        {items.map((item, index) => {
          const itemId = item.id != null ? String(item.id) : null;
          const description = getFieldEntry(item, fieldMap.description);
          const titles = shiftCenterToEmptyRight([
            getFieldValue(item, fieldMap.leftTitle),
            getFieldValue(item, fieldMap.centerTitle),
            getFieldValue(item, fieldMap.rightTitle),
          ], shiftCenterToRightWhenRightEmpty);
          const subtitles = shiftCenterToEmptyRight([
            getFieldValue(item, fieldMap.leftSubtitle),
            getFieldValue(item, fieldMap.centerSubtitle),
            getFieldValue(item, fieldMap.rightSubtitle),
          ], shiftCenterToRightWhenRightEmpty);
          const hasSubtitles = subtitles.some(Boolean);

          return (
            <div key={itemId || index} className="min-w-0">
              <div className="grid items-start gap-x-3 font-bold" style={{ gridTemplateColumns: columns }}>
                <div className="min-w-0 text-left" style={breakableTextStyle}>{titles[0]}</div>
                <div className="min-w-0 text-center" style={breakableTextStyle}>{titles[1]}</div>
                <div className="min-w-0 text-right" style={breakableTextStyle}>{titles[2]}</div>
              </div>
              {hasSubtitles && (
                <div className="grid items-start gap-x-3" style={{ gridTemplateColumns: columns }}>
                  <div className="min-w-0 text-left" style={breakableTextStyle}>{subtitles[0]}</div>
                  <div className="min-w-0 text-center" style={breakableTextStyle}>{subtitles[1]}</div>
                  <div className="min-w-0 text-right" style={breakableTextStyle}>{subtitles[2]}</div>
                </div>
              )}
              {description && (
                <div className="mt-1 min-w-0">
                  {sectionKey && itemId ? (
                    <Editable
                      target={{
                        sectionKey,
                        itemId,
                        fieldKey: description.key,
                        kind: 'html',
                        label: `${title} · 第 ${index + 1} 条`,
                      }}
                      html={description.value}
                    />
                  ) : (
                    <WysiwygContent dirtyHtml={description.value} />
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
