import React, { useMemo } from 'react';
import { MagicTemplateDSL } from '../types/magic-dsl';
import { Resume } from '../types/resume';
import get from 'lodash.get';
import { isBuiltInSection, zhTitleForSection } from '../sectionSemantics';
import { compileTreeComponent } from '../primitives/treeComponent';
import { renderNode as renderTreeNode } from '../primitives/dom/renderNode';

import { Header } from '../templateLayout/Header';
import { CenteredPhotoHeader } from '../templateLayout/CenteredPhotoHeader';
import { DefaultSection } from '../templateLayout/DefaultSection';
import { ThreeColumnSection } from '../templateLayout/ThreeColumnSection';
import { InlineKeyValueSection } from '../templateLayout/InlineKeyValueSection';
import { ListSection } from '../templateLayout/ListSection';
import { ProfileCard } from '../templateLayout/ProfileCard';
import { ContactInfo } from '../templateLayout/ContactInfo';
import { CompactList } from '../templateLayout/CompactList';
import { Timeline } from '../templateLayout/Timeline';
import { Layout } from '../templateLayout/Layout';
import { TwoColumnLayout } from '../templateLayout/TwoColumnLayout';
import { getSectionIcon } from '../templateLayout/utils';
import { getWebFontStack } from '../font-family';

const componentRegistry = {
  Header,
  CenteredPhotoHeader,
  DefaultSection,
  ThreeColumnSection,
  InlineKeyValueSection,
  Section: DefaultSection,
  ListSection,
  ProfileCard,
  ContactInfo,
  CompactList,
  Timeline,
  Layout,
  TwoColumnLayout,
};

/**
 * Field aliases for a section no template described.
 *
 * Deliberately generous and ordered by how a heading usually reads: a custom
 * section is whatever the candidate wrote — 个人优势, 获奖经历, 开源贡献 — so the
 * right field cannot be known ahead of time. `summary` leads the rich-text
 * aliases because it is the field the editor edits; `description` follows it so
 * older imports still show.
 */
const CUSTOM_SECTION_FIELD_MAP = {
  itemName: ['name', 'title', 'skill', 'role', 'company', 'school'],
  itemDetail: ['level', 'position', 'degree', 'issuer'],
  date: ['date'],
  summary: ['summary', 'description'],
};

/**
 * A `ListSection` for a section key the template does not declare.
 *
 * Returns null when there is nothing to show, so an empty custom section does
 * not print a bare heading. `ListSection` is the right shape: bold item name
 * plus rich text, which is what skills / languages / certificates already use
 * and what a custom section almost always is.
 */
function synthesiseCustomSection(
  data: Resume,
  sectionOrderItem: { key: string; label?: string },
) {
  // 内建分区不合成：模板把它留空是有意的，而它的 label 是 i18n key——
  // 合成出来会把 `sections.skills` 当标题印在纸上。
  // 判据来自 `sectionSemantics`，**与 PDF 渲染器共用同一份**。
  if (isBuiltInSection(sectionOrderItem.key)) return null;

  const items = (data.sections as Record<string, unknown> | undefined)?.[
    sectionOrderItem.key
  ];
  if (!Array.isArray(items) || items.length === 0) return null;

  return {
    id: `custom-section-${sectionOrderItem.key}`,
    type: 'ListSection' as const,
    dataBinding: `sections.${sectionOrderItem.key}`,
    position: { area: 'main' as const },
    // The label is the heading as the candidate wrote it, so it is already in
    // their language — the renderer's zh title mapping must not touch it.
    props: {
      title: sectionOrderItem.label || sectionOrderItem.key,
      titleZh: sectionOrderItem.label || sectionOrderItem.key,
      containerClassName: 'grid gap-x-6 gap-y-1',
    },
    fieldMap: CUSTOM_SECTION_FIELD_MAP,
  };
}

interface Props {
  template: MagicTemplateDSL;
  data: Resume;
  locale?: string;
}

function getSectionData(data: Resume, dataBinding: string) {
  // Defensive: a malformed resume (no `sections`/`info`) must render empty, not
  // throw and white-screen the whole app. The caller treats `undefined` as
  // "skip this section".
  if (!data || typeof data !== 'object') return undefined;
  if (dataBinding === 'info') {
    return data.info;
  }
  
  const isVisible = (item: unknown) => {
    if (!item || typeof item !== 'object') return true;
    const obj = item as Record<string, unknown>;
    return obj.visible !== false && obj.visible !== 'false' && obj.visible !== 0;
  };

  if (dataBinding.startsWith('sections.')) {
    const sectionKey = dataBinding.replace('sections.', '');
    const sectionItems = data.sections?.[sectionKey as keyof typeof data.sections];
    if (Array.isArray(sectionItems)) {
      return sectionItems.filter(isVisible);
    }
    return sectionItems;
  }
  
  const value = get(data, dataBinding);
  if (Array.isArray(value)) {
    return value.filter(isVisible);
  }
  return value;
}

function generateCSSVariables(designTokens: MagicTemplateDSL['designTokens'], layout: MagicTemplateDSL['layout']) {
  const cssVars: Record<string, string> = {
    '--color-primary': designTokens.colors.primary,
    '--color-secondary': designTokens.colors.secondary,
    '--color-text': designTokens.colors.text,
    '--color-text-secondary': designTokens.colors.textSecondary,
    '--color-background': designTokens.colors.background,
    '--color-border': designTokens.colors.border,
    '--font-family-primary': getWebFontStack(designTokens.typography.fontFamily.primary),
    '--font-size-xs': designTokens.typography.fontSize.xs,
    '--font-size-sm': designTokens.typography.fontSize.sm,
    '--font-size-md': designTokens.typography.fontSize.md,
    '--font-size-lg': designTokens.typography.fontSize.lg,
    '--font-size-xl': designTokens.typography.fontSize.xl,
    '--font-size-xxl': designTokens.typography.fontSize.xxl,
    '--font-size-title': designTokens.typography.fontSize.lg,
    '--font-size-body': designTokens.typography.fontSize.sm,
    '--font-weight-normal': designTokens.typography.fontWeight.normal.toString(),
    '--font-weight-medium': designTokens.typography.fontWeight.medium.toString(),
    '--font-weight-bold': designTokens.typography.fontWeight.bold.toString(),
    '--spacing-xs': designTokens.spacing.xs,
    '--spacing-sm': designTokens.spacing.sm,
    '--spacing-md': designTokens.spacing.md,
    '--spacing-lg': designTokens.spacing.lg,
    '--spacing-xl': designTokens.spacing.xl,
    '--radius-none': designTokens.borderRadius.none,
    '--radius-sm': designTokens.borderRadius.sm,
    '--radius-md': designTokens.borderRadius.md,
    '--radius-lg': designTokens.borderRadius.lg,
    '--line-height': (designTokens.typography as { lineHeight?: number }).lineHeight?.toString() || '1.5',
    '--letter-spacing': (designTokens.typography as { letterSpacing?: string }).letterSpacing || '0px',
    '--container-width': layout.containerWidth,
    '--container-padding': layout.padding,
    '--container-gap': layout.gap,
    '--paragraph-spacing': designTokens.spacing.md,
    '--section-spacing': designTokens.spacing.lg,
    '--section-title-spacing': designTokens.spacing.sm,
    '--title-divider-width': layout.showTitleDivider === false ? '0' : '1px',
    '--title-icon-display': layout.showTitleIcon === false ? 'none' : 'inline-block',
  };

  if (designTokens.colors.sidebar) {
    cssVars['--color-sidebar'] = designTokens.colors.sidebar;
  }
  if (designTokens.colors.accent) {
    cssVars['--color-accent'] = designTokens.colors.accent;
  }
  if (designTokens.typography.fontFamily.secondary) {
    cssVars['--font-family-secondary'] = designTokens.typography.fontFamily.secondary;
  }
  if (designTokens.typography.fontFamily.mono) {
    cssVars['--font-family-mono'] = designTokens.typography.fontFamily.mono;
  }

  return cssVars as React.CSSProperties;
}

function getLayoutComponent(layoutType: string) {
  switch (layoutType) {
    case 'two-column':
      return TwoColumnLayout;
    case 'single-column':
    default:
      return Layout;
  }
}

export const MagicResumeRenderer = React.memo(({ template, data, locale }: Props) => {
  const { layout, designTokens, components } = template;
  const isChineseLocale = (locale || '').toLowerCase().startsWith('zh');
  
  const cssVariables = useMemo(
    () => generateCSSVariables(designTokens, layout),
    [designTokens, layout]
  );
  
  const LayoutContainer = getLayoutComponent(layout.type);

  /**
   * 整棵模板树接管渲染。**放在最前面**：有它就完全不看 `template.components`。
   *
   * 与第 2 期的组件级接缝是两个层级——那个是「某一个分区用树画」，
   * 这个是「整份简历用树画」。两者共用同一个编译入口，坏树都降级成不渲染。
   */
  const overrideRoot = useMemo(
    () =>
      data.templateOverride
        ? compileTreeComponent(
            data.templateOverride,
            data as unknown as Record<string, unknown>,
            'templateOverride',
          )
        : undefined,
    [data],
  );

  // `sectionOrder` is where an explicit icon choice lives; the component list
  // is keyed by dataBinding and knows nothing about it.
  const iconBySectionKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data.sectionOrder ?? []) {
      const icon = (item as { icon?: string }).icon;
      if (item?.key && icon) map.set(item.key, icon);
    }
    return map;
  }, [data.sectionOrder]);
  
  const sortedComponents = useMemo(() => {
    const sidebarComponents = components.filter(comp => comp.position?.area === 'sidebar');
    const mainComponents = components.filter(comp => comp.position?.area !== 'sidebar');
    
    const headerComponents = mainComponents.filter(comp => comp.dataBinding === 'info');
    const sectionComponents = mainComponents.filter(comp => comp.dataBinding.startsWith('sections.'));
    // Sidebar-rendered sections count as declared; matching against main-column
    // components alone made each of them look missing and synthesised a duplicate.
    const declaredBindings = new Set(
      components
        .filter(comp => comp.dataBinding?.startsWith('sections.'))
        .map(comp => comp.dataBinding)
    );

    const sortedMainSections = [] as typeof components;

    if (data.sectionOrder && Array.isArray(data.sectionOrder)) {
      data.sectionOrder.forEach(sectionOrderItem => {
        const matchingComponent = sectionComponents.find(comp =>
          comp.dataBinding === `sections.${sectionOrderItem.key}`
        );
        if (matchingComponent) {
          sortedMainSections.push(matchingComponent);
          return;
        }
        if (declaredBindings.has(`sections.${sectionOrderItem.key}`)) return;
        // Undeclared key — synthesised here rather than added to every template
        // config, so templates written later inherit the behaviour.
        const synthesised = synthesiseCustomSection(data, sectionOrderItem);
        if (synthesised) sortedMainSections.push(synthesised);
      });
    }
    
    const remainingMainSections = sectionComponents.filter(comp => 
      !sortedMainSections.includes(comp)
    );
    
    const sortedSidebarComponents = [...sidebarComponents].sort(
      (a, b) => (a.position?.order || 0) - (b.position?.order || 0)
    );
    
    return [...sortedSidebarComponents, ...headerComponents, ...sortedMainSections, ...remainingMainSections];
    // `data.sections` belongs here: synthesiseCustomSection reads it, so without
    // it "this section is empty" stayed cached after the user filled it in.
  }, [components, data.sectionOrder, data.sections]);

  if (data.templateOverride) {
    // 外层的 CSS 变量照留：`.wysiwyg` 那套全局正文样式仍然靠它取色与字号。
    // 编译失败时这里是一个空壳而不是白屏——上游还能看见页面框架。
    return <div style={cssVariables}>{overrideRoot ? renderTreeNode(overrideRoot) : null}</div>;
  }

  return (
    <div style={cssVariables}>
      <LayoutContainer layout={layout} designTokens={designTokens}>
        {sortedComponents.map(component => {
          // ── 绞杀榕接缝 ──
          // 声明了原语树就走新路径。19 个旧模板都没有这个字段，因此一行不改地
          // 继续走下面的 legacy 注册表。
          if (component.tree) {
            const root = compileTreeComponent(
              component.tree,
              data as unknown as Record<string, unknown>,
              component.id,
            );
            return root ? (
              <React.Fragment key={component.id}>{renderTreeNode(root)}</React.Fragment>
            ) : null;
          }

          const Component = componentRegistry[component.type as keyof typeof componentRegistry];
          if (!Component) {
            console.warn(`Component "${component.type}" not found in registry.`);
            return null;
          }

          const sectionData = getSectionData(data, component.dataBinding);
          
          if (!sectionData) {
            return null;
          }

          const needsArrayData = [
            'DefaultSection',
            'ThreeColumnSection',
            'InlineKeyValueSection',
            'ListSection',
            'Timeline',
            'CompactList',
          ];
          if (needsArrayData.includes(component.type)) {
            if (!Array.isArray(sectionData) || sectionData.length === 0) {
              return null;
            }
          }

          const sectionKey = component.dataBinding.startsWith('sections.')
            ? component.dataBinding.replace('sections.', '')
            : undefined;

          const rawTitle = (component.props?.title as string) || 'Section';
          const resolvedTitle = (() => {
            if (!isChineseLocale) return rawTitle;
            const explicitChineseTitle = component.props?.titleZh;
            if (typeof explicitChineseTitle === 'string' && explicitChineseTitle.trim()) {
              return explicitChineseTitle;
            }
            return zhTitleForSection(sectionKey, rawTitle);
          })();

          const props = {
            data: sectionData,
            items: Array.isArray(sectionData) ? sectionData : [],
            fieldMap: component.fieldMap,
            style: component.style,
            position: component.position,
            ...component.props,
            title: resolvedTitle,
            titleIcon: getSectionIcon(
              sectionKey,
              rawTitle,
              sectionKey ? iconBySectionKey.get(sectionKey) : undefined,
            ),
            sectionKey,
          };

          return (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Component key={component.id} {...(props as any)} />
          );
        })}
      </LayoutContainer>
    </div>
  );
});

MagicResumeRenderer.displayName = 'MagicResumeRenderer';
