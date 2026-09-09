import React from 'react';
import { getFieldValue, getFieldEntry } from './utils';
import { Editable } from '../renderer/EditableCanvas';
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
  /**
   * resume section key —— 有它才渲染可编辑锚点。
   *
   * 少了这一条，用这个布局的区块（azurill / chikorita / gengar 等模板的技能、语言、
   * 证书）在画布上**一个 `data-resume-path` 节点都没有**：AI 改了它们，评审卡无处可渲染，
   * 而评审条照样计数——用户看到「有 N 处改动」却一处也点不到。
   */
  sectionKey?: string;
}

export const CompactList = React.memo(function CompactList({ title, items, fieldMap = {}, style, position, titleIcon: TitleIcon, levelBar, sectionKey }: Props) {
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
          const nameEntry = getFieldEntry(item, fieldMap.title || ['name', 'skill', 'language', 'certificate']);
          const name = nameEntry?.value ?? '';
          const level = getFieldValue(item, fieldMap.level || 'level');
          const itemId = item.id != null ? String(item.id) : null;
          const frac = levelBar ? skillLevelToFraction(level) : null;
          const trackColor = isInSidebar ? 'rgba(255,255,255,0.22)' : 'var(--color-border)';
          const fillColor = isInSidebar ? 'var(--color-background)' : 'var(--color-primary)';

          return (
            <li key={itemId || idx} style={{ color: textColor }}>
              <div className="font-medium" style={{ fontSize: 'var(--font-size-body)' }}>
                {nameEntry && sectionKey && itemId ? (
                  <Editable
                    target={{
                      sectionKey,
                      itemId,
                      fieldKey: nameEntry.key,
                      kind: 'text',
                      label: `${title} · 第 ${idx + 1} 条`,
                    }}
                    text={nameEntry.value}
                  />
                ) : (
                  name
                )}
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
