/**
 * 导出的 PDF 是**一整页长页**，不是分页 A4——这是刻意选择，不是 bug。
 *
 * `pageSize` 只给宽不给高，单个 `<Page>` 随内容长高；`scripts/render-pdf-smoke.mjs`
 * 断言 `/Count 1` 把这个选择钉住。理由是产品面向线上投递与分享链接，连续阅读优于分页，
 * 不会有经历被拦腰截断。代价是打印会被缩放或裁切。
 *
 * 改之前要知道：下面的 `wrap={false}` 与 `minPresenceAhead` 是**失效的**——它们管的是
 * 跨页孤行，而这里没有分页。保留是因为哪天恢复分页它们就是对的写法，别照着再加。
 */
import React from 'react';
import {
  Document,
  Image,
  Link,
  Page,
  Text,
  View,
} from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { IconNode } from 'lucide';
import {
  Award,
  Briefcase,
  FolderOpen,
  Globe,
  GraduationCap,
  Languages,
  Mail,
  MapPin,
  Phone,
  User,
  Wrench,
} from 'lucide';
import type {
  ComponentDefinition,
  ComponentStyle,
  FieldMapping,
  MagicTemplateDSL,
} from '../types/magic-dsl';
import type { InfoType, Resume, SectionItem } from '../types/resume';
import { getPdfFontStack, getPdfRichTextFontFamily } from '../font-family';
import { PdfLucideIcon } from './PdfLucideIcon';
import { PdfRichText } from './PdfRichText';
import { FREE_FORM_PAGE_SIZE, getFreeFormPageMinHeight } from './page-size';
import { skillLevelToFraction } from '../templateLayout/skill-level';

type PdfStyle = Style | Style[];

export interface MagicResumePdfDocumentProps {
  data: Resume;
  template: MagicTemplateDSL;
  locale?: string;
  /** 简历含子集字体之外的 CJK 字时，调用方注册全量字体并置位此项；默认用子集字族。 */
  cjkFallback?: boolean;
}

const ZH_TITLE_BY_SECTION_KEY: Record<string, string> = {
  summary: '个人总结',
  experience: '工作经历',
  education: '教育经历',
  projects: '项目经历',
  skills: '专业技能',
  languages: '语言能力',
  certificates: '证书资质',
  profiles: '个人主页',
  awards: '奖项',
};

const ZH_TITLE_BY_ENGLISH: Record<string, string> = {
  summary: '个人总结',
  experience: '工作经历',
  'work experience': '工作经历',
  'professional experience': '专业经历',
  education: '教育经历',
  projects: '项目经历',
  skills: '专业技能',
  'technical skills': '技术技能',
  languages: '语言能力',
  certificates: '证书资质',
  certifications: '证书资质',
  profiles: '个人主页',
  links: '个人主页',
  awards: '奖项',
};

const SECTION_ICON_MAP: Record<string, IconNode> = {
  summary: User,
  experience: Briefcase,
  education: GraduationCap,
  projects: FolderOpen,
  skills: Wrench,
  languages: Languages,
  certificates: Award,
  profiles: User,
  awards: Award,
};

const TITLE_ICON_KEYWORDS: Array<[string, IconNode]> = [
  ['工作', Briefcase], ['experience', Briefcase], ['work', Briefcase],
  ['教育', GraduationCap], ['education', GraduationCap],
  ['项目', FolderOpen], ['project', FolderOpen],
  ['技能', Wrench], ['skill', Wrench], ['technical', Wrench],
  ['语言', Languages], ['language', Languages],
  ['证书', Award], ['certif', Award], ['award', Award],
  ['个人', User], ['profile', User], ['summary', User],
  ['联系', Globe], ['contact', Globe],
];

const getSectionIcon = (component: ComponentDefinition): IconNode | undefined => {
  const sectionKey = component.dataBinding.startsWith('sections.')
    ? component.dataBinding.slice('sections.'.length)
    : '';
  if (SECTION_ICON_MAP[sectionKey]) return SECTION_ICON_MAP[sectionKey];

  const title = String(component.props?.title ?? '').toLowerCase();
  return TITLE_ICON_KEYWORDS.find(([keyword]) => title.includes(keyword))?.[1];
};

const cssSizeToPoints = (value: string | number | undefined, fallback = 0): number => {
  if (typeof value === 'number') return value * 0.75;
  if (!value) return fallback;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (value.endsWith('rem')) return parsed * 12;
  if (value.endsWith('mm')) return parsed * 2.83465;
  if (value.endsWith('pt')) return parsed;
  return parsed * 0.75;
};

const getNestedValue = (item: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, item);
};

const getFieldValue = (
  item: Record<string, unknown>,
  field: string | string[] | undefined,
): string => {
  if (!field) return '';
  const fields = Array.isArray(field) ? field : [field];

  for (const candidate of fields) {
    const value = getNestedValue(item, candidate);
    if (value !== undefined && value !== null && value !== '') return String(value);
  }

  return '';
};

const isVisible = (item: SectionItem) => (
  item.visible !== false && item.visible !== ('false' as unknown) && item.visible !== (0 as unknown)
);

const getSectionItems = (data: Resume, binding: string): SectionItem[] => {
  if (!binding.startsWith('sections.')) return [];
  const key = binding.slice('sections.'.length);
  return (data.sections[key] ?? []).filter(isVisible);
};

const resolveTitle = (component: ComponentDefinition, locale?: string): string => {
  const title = String(component.props?.title ?? 'Section');
  if (!locale?.toLowerCase().startsWith('zh')) return title;

  const explicitChineseTitle = component.props?.titleZh;
  if (typeof explicitChineseTitle === 'string' && explicitChineseTitle.trim()) {
    return explicitChineseTitle;
  }

  const sectionKey = component.dataBinding.startsWith('sections.')
    ? component.dataBinding.slice('sections.'.length)
    : '';
  return ZH_TITLE_BY_SECTION_KEY[sectionKey] ?? ZH_TITLE_BY_ENGLISH[title.trim().toLowerCase()] ?? title;
};

/** 模板未描述的 section 的字段别名。必须与 HTML 渲染器保持一致，否则屏幕与导出会长得不一样。 */
const CUSTOM_SECTION_FIELD_MAP = {
  itemName: ['name', 'title', 'skill', 'role', 'company', 'school'],
  itemDetail: ['level', 'position', 'degree', 'issuer'],
  date: ['date'],
  summary: ['summary', 'description'],
};

/** A `ListSection` definition for an ordered key the template does not declare. */
const synthesiseCustomSection = (
  data: Resume,
  entry: { key: string; label?: string },
): ComponentDefinition | null => {
  // Built-ins are never synthesised — see the HTML renderer's twin.
  if (ZH_TITLE_BY_SECTION_KEY[entry.key]) return null;

  const items = (data.sections as Record<string, unknown> | undefined)?.[entry.key];
  if (!Array.isArray(items) || items.length === 0) return null;

  const title = entry.label || entry.key;
  return {
    id: `custom-section-${entry.key}`,
    type: 'ListSection',
    dataBinding: `sections.${entry.key}`,
    position: { area: 'main' },
    // Both titles carry the heading as the candidate wrote it, so `resolveTitle`
    // cannot swap in a translation for a section only they have named.
    props: { title, titleZh: title },
    fieldMap: CUSTOM_SECTION_FIELD_MAP,
  } as ComponentDefinition;
};

const sortComponents = (template: MagicTemplateDSL, data: Resume): ComponentDefinition[] => {
  const sidebar = template.components
    .filter((component) => component.position?.area === 'sidebar')
    .sort((a, b) => (a.position?.order ?? 0) - (b.position?.order ?? 0));
  const main = template.components.filter((component) => component.position?.area !== 'sidebar');
  const headers = main.filter((component) => component.dataBinding === 'info');
  const sections = main.filter((component) => component.dataBinding.startsWith('sections.'));
  // Sidebar-rendered sections count as declared — see the HTML renderer's twin.
  const declaredBindings = new Set(
    template.components
      .filter((component) => component.dataBinding?.startsWith('sections.'))
      .map((component) => component.dataBinding),
  );
  const ordered: ComponentDefinition[] = [];

  for (const entry of data.sectionOrder ?? []) {
    const component = sections.find((candidate) => candidate.dataBinding === `sections.${entry.key}`);
    if (component) {
      ordered.push(component);
      continue;
    }
    if (declaredBindings.has(`sections.${entry.key}`)) continue;
    // Undeclared key — synthesised so it does not vanish from the exported file.
    const synthesised = synthesiseCustomSection(data, entry);
    if (synthesised) ordered.push(synthesised);
  }

  for (const component of sections) {
    if (!ordered.includes(component)) ordered.push(component);
  }

  return [...sidebar, ...headers, ...ordered];
};

const toPdfComponentStyle = (style?: ComponentStyle): Style => {
  if (!style) return {};

  const pdfStyle: Style = {};
  const marginTop = style.marginTop ?? style.margin;
  const marginRight = style.marginRight ?? style.margin;
  const marginBottom = style.marginBottom ?? style.margin;
  const marginLeft = style.marginLeft ?? style.margin;

  if (style.backgroundColor !== undefined) pdfStyle.backgroundColor = style.backgroundColor;
  if (style.color !== undefined) pdfStyle.color = style.color;
  if (style.padding !== undefined) pdfStyle.padding = cssSizeToPoints(style.padding);
  if (marginTop !== undefined) pdfStyle.marginTop = cssSizeToPoints(marginTop);
  if (marginRight !== undefined) pdfStyle.marginRight = cssSizeToPoints(marginRight);
  if (marginBottom !== undefined) pdfStyle.marginBottom = cssSizeToPoints(marginBottom);
  if (marginLeft !== undefined) pdfStyle.marginLeft = cssSizeToPoints(marginLeft);
  if (style.borderRadius !== undefined) pdfStyle.borderRadius = cssSizeToPoints(style.borderRadius);
  if (style.fontSize !== undefined) pdfStyle.fontSize = cssSizeToPoints(style.fontSize);
  if (style.fontWeight !== undefined) pdfStyle.fontWeight = Number(style.fontWeight);
  if (style.textAlign !== undefined) pdfStyle.textAlign = style.textAlign;

  return pdfStyle;
};

interface RenderContext {
  colors: MagicTemplateDSL['designTokens']['colors'];
  typography: MagicTemplateDSL['designTokens']['typography'];
  spacing: MagicTemplateDSL['designTokens']['spacing'];
  showTitleDivider: boolean;
  showTitleIcon: boolean;
  richTextFontFamily: string;
  cjkFallback: boolean;
  locale?: string;
}

const InlineIcon = ({ icon, color, size, offsetY, strokeWidth = 2 }: {
  icon: IconNode;
  color: string;
  size: number;
  offsetY?: number;
  strokeWidth?: number;
}) => (
  <PdfLucideIcon
    icon={icon}
    color={color}
    size={size}
    strokeWidth={strokeWidth}
    style={{
      flexShrink: 0,
      marginTop: offsetY,
    }}
  />
);

const SectionTitle = ({ title, icon, sidebar, color, dividerColor, fontSize, context }: {
  title: string;
  icon?: IconNode;
  sidebar?: boolean;
  color?: string;
  dividerColor?: string;
  fontSize?: number;
  context: RenderContext;
}) => {
  const titleColor = color ?? (sidebar ? context.colors.background : context.colors.primary);
  const borderColor = dividerColor ?? titleColor;
  const resolvedFontSize = fontSize ?? cssSizeToPoints(context.typography.fontSize.lg, 12);
  const titleSpacing = cssSizeToPoints(context.spacing.sm, 6);
  const lineHeight = Math.min(context.typography.lineHeight ?? 1.15, 1.15);
  return (
    <View
      style={{
        alignItems: 'flex-start',
        borderBottomColor: borderColor,
        borderBottomWidth: context.showTitleDivider ? 0.75 : 0,
        flexDirection: 'row',
        gap: 4,
        marginBottom: titleSpacing,
        paddingBottom: titleSpacing * 0.25,
      }}
    >
      {context.showTitleIcon && icon ? (
        <InlineIcon icon={icon} color={titleColor} size={resolvedFontSize} />
      ) : null}
      <Text
        style={{
          color: titleColor,
          fontSize: resolvedFontSize,
          fontWeight: context.typography.fontWeight.medium ?? 500,
          lineHeight,
          textTransform: sidebar ? 'uppercase' : undefined,
        }}
      >
        {title}
      </Text>
    </View>
  );
};

const safeWebsiteUrl = (value: string): string => {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const ContactText = ({ value, href, style }: { value: string; href?: string; style: PdfStyle }) => {
  if (!value) return null;
  return href ? <Link src={href} style={style}>{value}</Link> : <Text style={style}>{value}</Text>;
};

const DateText = ({
  value,
  color,
  fontFamily,
  fontSize,
  fontWeight,
  opacity,
  textAlign,
}: {
  value: string;
  color: string;
  fontFamily: string[];
  fontSize: number;
  fontWeight?: number;
  opacity?: number;
  textAlign?: 'left' | 'right';
}) => {
  if (!value) return null;

  return (
    <Text
      style={{
        color,
        fontFamily: fontFamily as unknown as string,
        fontSize,
        fontWeight,
        lineHeight: 1.2,
        opacity,
        textAlign,
      }}
    >
      {value}
    </Text>
  );
};

const HeaderBlock = ({ info, component, context }: {
  info: InfoType;
  component: ComponentDefinition;
  context: RenderContext;
}) => {
  const props = component.props ?? {};
  const avatarPosition = props.avatarPosition === 'right' ? 'right' : 'left';
  const labelContacts = props.contactStyle === 'label';
  const avatarWidth = cssSizeToPoints(Number(props.avatarWidth ?? 40));
  const avatarHeight = cssSizeToPoints(Number(props.avatarHeight ?? 40));
  const contactFontSize = 7.5;
  const contactIconOffsetY = -0.75;
  const contactLineHeight = 1;
  const contacts: Array<{ label: string; value: string; href: string; icon?: IconNode }> = [
    { label: context.locale?.startsWith('zh') ? '电话' : 'Phone', value: info.phoneNumber, href: info.phoneNumber ? `tel:${info.phoneNumber}` : '', icon: Phone },
    { label: context.locale?.startsWith('zh') ? '邮箱' : 'Email', value: info.email, href: info.email ? `mailto:${info.email}` : '', icon: Mail },
    { label: context.locale?.startsWith('zh') ? '地址' : 'Address', value: info.address, href: '', icon: MapPin },
    { label: context.locale?.startsWith('zh') ? '网站' : 'Website', value: info.website, href: safeWebsiteUrl(info.website), icon: Globe },
  ].filter((item) => item.value);

  if (props.showCustomFields) {
    for (const field of info.customFields ?? []) {
      if (field.name?.trim() && field.value?.trim()) {
        contacts.push({ label: field.name.trim(), value: field.value.trim(), href: '' });
      }
    }
  }

  const avatar = info.avatar ? (
    <Image
      src={info.avatar}
      style={{
        width: avatarWidth,
        height: avatarHeight,
        borderRadius: props.avatarRounded === false ? 3 : Math.min(avatarWidth, avatarHeight) / 2,
        objectFit: 'cover',
      }}
    />
  ) : null;

  return (
    <View
      wrap={false}
      style={[
        { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
        toPdfComponentStyle(component.style),
      ]}
    >
      {avatarPosition === 'left' ? avatar : null}
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 3 }}>
        <Text style={{ color: context.colors.text, fontSize: labelContacts ? 16 : 13, fontWeight: 700 }}>
          {info.fullName || (context.locale?.startsWith('zh') ? '你的名字' : 'Your Name')}
        </Text>
        {info.headline ? <Text style={{ color: context.colors.textSecondary, fontSize: 9 }}>{info.headline}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: labelContacts ? 5 : 7, marginTop: 2 }}>
          {contacts.map((item) => (
            <View key={`${item.label}:${item.value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, width: labelContacts ? '47%' : undefined }}>
              {labelContacts ? <Text style={{ color: context.colors.textSecondary, fontSize: contactFontSize, lineHeight: contactLineHeight }}>{item.label}:</Text> : null}
              {!labelContacts && item.icon ? (
                <InlineIcon
                  icon={item.icon}
                  color={context.colors.primary}
                  size={contactFontSize}
                  offsetY={contactIconOffsetY}
                  strokeWidth={2.5}
                />
              ) : null}
              <ContactText value={item.value} href={item.href} style={{ color: context.colors.text, fontSize: contactFontSize, lineHeight: contactLineHeight, textDecoration: 'none' }} />
            </View>
          ))}
        </View>
      </View>
      {avatarPosition === 'right' ? avatar : null}
    </View>
  );
};

const CenteredPhotoHeaderBlock = ({ info, component, context }: {
  info: InfoType;
  component: ComponentDefinition;
  context: RenderContext;
}) => {
  const props = component.props ?? {};
  const avatarWidth = cssSizeToPoints(Number(props.avatarWidth ?? 86));
  const avatarHeight = cssSizeToPoints(Number(props.avatarHeight ?? 119));
  const separator = typeof props.contactSeparator === 'string' ? props.contactSeparator : '|';
  const showCustomFields = props.showCustomFields === true;
  const nameFontSize = cssSizeToPoints(context.typography.fontSize.xxl, 22);
  const contactFontSize = cssSizeToPoints(context.typography.fontSize.md, 10);
  const headlineFontSize = cssSizeToPoints(context.typography.fontSize.lg, 12);
  const contacts: Array<{ key: string; value: string; href: string }> = [
    { key: 'phone', value: info.phoneNumber, href: info.phoneNumber ? `tel:${info.phoneNumber}` : '' },
    { key: 'email', value: info.email, href: info.email ? `mailto:${info.email}` : '' },
    { key: 'address', value: info.address, href: '' },
    { key: 'website', value: info.website, href: safeWebsiteUrl(info.website) },
  ].filter((item) => item.value);

  if (showCustomFields) {
    for (const [index, field] of (info.customFields ?? []).entries()) {
      const value = field?.value?.trim();
      if (!value) continue;
      contacts.push({ key: field.id || `custom-${index}`, value, href: '' });
    }
  }

  const avatar = info.avatar ? (
    <Image
      src={info.avatar}
      style={{
        width: avatarWidth,
        height: avatarHeight,
        borderRadius: props.avatarRounded === true ? Math.min(avatarWidth, avatarHeight) / 2 : 0,
        objectFit: 'cover',
      }}
    />
  ) : null;

  return (
    <View
      wrap={false}
      style={[
        { flexDirection: 'row', alignItems: 'flex-start' },
        toPdfComponentStyle(component.style),
      ]}
    >
      <View style={{ width: avatarWidth, flexShrink: 0 }} />
      <View style={{ flexGrow: 1, flexShrink: 1, alignItems: 'center', paddingTop: 3 }}>
        <Text style={{ color: context.colors.text, fontSize: nameFontSize, fontWeight: 700, textAlign: 'center' }}>
          {info.fullName || (context.locale?.startsWith('zh') ? '你的名字' : 'Your Name')}
        </Text>
        {contacts.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 7 }}>
            {contacts.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 ? (
                  <Text style={{ color: context.colors.text, fontSize: contactFontSize, marginHorizontal: 3 }}>
                    {separator}
                  </Text>
                ) : null}
                <ContactText
                  value={item.value}
                  href={item.href}
                  style={{ color: context.colors.text, fontSize: contactFontSize, textDecoration: 'none' }}
                />
              </React.Fragment>
            ))}
          </View>
        ) : null}
        {info.headline ? (
          <Text style={{ color: context.colors.text, fontSize: headlineFontSize, marginTop: 7, textAlign: 'center' }}>
            {info.headline}
          </Text>
        ) : null}
      </View>
      <View style={{ width: avatarWidth, minHeight: avatarHeight, flexShrink: 0, alignItems: 'flex-end' }}>
        {avatar}
      </View>
    </View>
  );
};

const ProfileBlock = ({ info, component, sidebar, context }: {
  info: InfoType;
  component: ComponentDefinition;
  sidebar: boolean;
  context: RenderContext;
}) => {
  const textColor = component.style?.color ?? (sidebar ? context.colors.background : context.colors.text);
  const nameFontSize = cssSizeToPoints(
    sidebar ? context.typography.fontSize.xl : context.typography.fontSize.xxl,
    sidebar ? 15 : 18,
  );
  const headlineFontSize = cssSizeToPoints(
    sidebar ? context.typography.fontSize.md : context.typography.fontSize.lg,
    sidebar ? 10.5 : 12,
  );
  const contentGap = cssSizeToPoints(context.spacing.sm, 6);
  const contacts = [
    { icon: Mail, value: info.email },
    { icon: Phone, value: info.phoneNumber },
    { icon: MapPin, value: info.address },
    { icon: Globe, value: info.website },
  ].filter((item) => item.value);
  return (
    <View
      wrap={false}
      style={[
        { alignItems: 'center', gap: contentGap },
        toPdfComponentStyle(component.style),
      ]}
    >
      {info.avatar ? (
        <Image src={info.avatar} style={{ width: 72, height: 72, borderRadius: 36, objectFit: 'cover' }} />
      ) : null}
      <Text style={{ color: textColor, fontSize: nameFontSize, fontWeight: 700, textAlign: 'center' }}>
        {info.fullName || (context.locale?.startsWith('zh') ? '你的名字' : 'Your Name')}
      </Text>
      {info.headline ? (
        <Text style={{ color: textColor, fontSize: headlineFontSize, fontWeight: 500, opacity: 0.8, textAlign: 'center' }}>
          {info.headline}
        </Text>
      ) : null}
      {!sidebar && contacts.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 }}>
          {contacts.map((item) => (
            <View key={item.value} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <InlineIcon icon={item.icon} color={context.colors.textSecondary} size={8} offsetY={-0.75} />
              <Text style={{ color: context.colors.textSecondary, fontSize: 8, lineHeight: 1 }}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const ContactBlock = ({ info, component, sidebar, context }: {
  info: InfoType;
  component: ComponentDefinition;
  sidebar: boolean;
  context: RenderContext;
}) => {
  const color = component.style?.color ?? (sidebar ? context.colors.background : context.colors.text);
  const iconColor = /^#[\da-f]{6}$/i.test(color) ? `${color}cc` : color;
  const fontSize = cssSizeToPoints('14px', 10.5);
  const iconSize = cssSizeToPoints('16px', 12);
  const lineHeight = 1.2;
  const itemGap = cssSizeToPoints('12px', 9);
  const items = [
    { icon: MapPin, value: info.address, href: '' },
    { icon: Phone, value: info.phoneNumber, href: info.phoneNumber ? `tel:${info.phoneNumber}` : '' },
    { icon: Mail, value: info.email, href: info.email ? `mailto:${info.email}` : '' },
    { icon: Globe, value: info.website, href: safeWebsiteUrl(info.website) },
  ].filter((item) => item.value);
  if (items.length === 0) return null;

  return (
    <View
      style={[
        {
          gap: cssSizeToPoints(context.spacing.md, 12),
        },
        toPdfComponentStyle(component.style),
      ]}
    >
      <SectionTitle
        title={context.locale?.startsWith('zh') ? '联系方式' : 'Contact'}
        sidebar={sidebar}
        color={color}
        dividerColor={color}
        fontSize={fontSize}
        context={context}
      />
      <View style={{ gap: itemGap }}>
        {items.map((item) => (
          <View key={item.value} style={{ flexDirection: 'row', alignItems: 'center', gap: itemGap }}>
            <InlineIcon icon={item.icon} color={iconColor} size={iconSize} />
            <ContactText
              value={item.value}
              href={item.href}
              style={{ color, fontSize, lineHeight, textDecoration: 'none' }}
            />
          </View>
        ))}
      </View>
    </View>
  );
};

const Description = ({
  value,
  color,
  fontFamily,
  fontSize = 8,
  marginTop = 0,
}: {
  value: string;
  color: string;
  fontFamily: string;
  fontSize?: number;
  marginTop?: number;
}) => {
  return value ? (
    <PdfRichText
      html={value}
      color={color}
      fontFamily={fontFamily}
      fontSize={fontSize}
      lineHeight={1.5}
      marginTop={marginTop}
    />
  ) : null;
};

/**
 * Name/value pairs the user added to an item.
 *
 * Rendered from the item directly rather than through the fieldMap, exactly as
 * the HTML renderer does: a key no fieldMap declares is dropped silently, so a
 * field somebody typed would be stored, visible on screen, and missing from the
 * export — the worst place for it to go quiet.
 */
const ItemCustomFields = ({ item, context, fontSize }: {
  item: SectionItem;
  context: RenderContext;
  fontSize: number;
}) => {
  const fields = (item.customFields ?? []).filter((field) => field?.name || field?.value);
  if (fields.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {fields.map((field) => (
        <Text key={field.id} style={{ color: context.colors.text, fontSize }}>
          {field.name ? `${field.name}${field.value ? '：' : ''}` : ''}
          {field.value}
        </Text>
      ))}
    </View>
  );
};

const DefaultSectionBlock = ({ component, items, context }: {
  component: ComponentDefinition;
  items: SectionItem[];
  context: RenderContext;
}) => {
  const fields = component.fieldMap ?? {};
  const bodyFontSize = cssSizeToPoints(context.typography.fontSize.sm, 9);
  const fieldWeight = context.typography.fontWeight.medium ?? 500;
  const dateFontFamily = getPdfFontStack(context.typography.fontFamily.primary, context.cjkFallback);
  return (
    <View style={toPdfComponentStyle(component.style)}>
      <SectionTitle title={resolveTitle(component, context.locale)} icon={getSectionIcon(component)} context={context} />
      <View style={{ gap: cssSizeToPoints(context.spacing.md, 8) }}>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          return (
            <View key={item.id || index} wrap={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flexGrow: 1, flexShrink: 1 }}>
                  <Text style={{ color: context.colors.text, fontSize: bodyFontSize, fontWeight: fieldWeight }}>{getFieldValue(record, fields.mainTitle)}</Text>
                  <Text style={{ color: context.colors.text, fontSize: bodyFontSize }}>{getFieldValue(record, fields.mainSubtitle)}</Text>
                  <Text style={{ color: context.colors.textSecondary, fontSize: bodyFontSize }}>{getFieldValue(record, fields.secondarySubtitle)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                  <DateText
                    value={getFieldValue(record, fields.sideTitle)}
                    color={context.colors.text}
                    fontFamily={dateFontFamily}
                    fontSize={bodyFontSize}
                    fontWeight={fieldWeight}
                    textAlign="right"
                  />
                  <Text style={{ color: context.colors.text, fontSize: bodyFontSize }}>{getFieldValue(record, fields.sideSubtitle)}</Text>
                  <Text style={{ color: context.colors.textSecondary, fontSize: bodyFontSize }}>{getFieldValue(record, fields.secondarySideSubtitle)}</Text>
                </View>
              </View>
              <ItemCustomFields item={item} context={context} fontSize={bodyFontSize} />
              <Description
                value={getFieldValue(record, fields.description)}
                color={context.colors.text}
                fontFamily={context.richTextFontFamily}
                fontSize={bodyFontSize}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
};

const ListSectionBlock = ({ component, items, context }: {
  component: ComponentDefinition;
  items: SectionItem[];
  context: RenderContext;
}) => {
  const fields = component.fieldMap ?? {};
  const bodyFontSize = cssSizeToPoints(context.typography.fontSize.sm, 9);
  const fieldWeight = context.typography.fontWeight.medium ?? 500;
  const dateFontFamily = getPdfFontStack(context.typography.fontFamily.primary, context.cjkFallback);
  return (
    <View style={toPdfComponentStyle(component.style)}>
      <SectionTitle title={resolveTitle(component, context.locale)} icon={getSectionIcon(component)} context={context} />
      <View style={{ gap: 6 }}>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          return (
            <View key={item.id || index} wrap={false}>
              <Text style={{ color: context.colors.text, fontSize: bodyFontSize, fontWeight: fieldWeight }}>{getFieldValue(record, fields.itemName)}</Text>
              <Text style={{ color: context.colors.text, fontSize: bodyFontSize }}>{getFieldValue(record, fields.itemDetail)}</Text>
              <DateText
                value={getFieldValue(record, fields.date)}
                color={context.colors.textSecondary}
                fontFamily={dateFontFamily}
                fontSize={bodyFontSize}
              />
              <ItemCustomFields item={item} context={context} fontSize={bodyFontSize} />
              <Description
                value={getFieldValue(record, fields.summary)}
                color={context.colors.text}
                fontFamily={context.richTextFontFamily}
                fontSize={bodyFontSize}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
};

const getThreeColumnRatio = (component: ComponentDefinition): [number, number, number] => {
  const value = component.props?.columnRatio;
  if (!Array.isArray(value) || value.length !== 3) return [1.65, 0.85, 1.15];
  const parsed = value.map(Number);
  return parsed.every((item) => Number.isFinite(item) && item > 0)
    ? parsed as [number, number, number]
    : [1.65, 0.85, 1.15];
};

const ThreeColumnSectionBlock = ({ component, items, context }: {
  component: ComponentDefinition;
  items: SectionItem[];
  context: RenderContext;
}) => {
  const fields = component.fieldMap ?? {};
  const bodyFontSize = cssSizeToPoints(context.typography.fontSize.sm, 9);
  const ratios = getThreeColumnRatio(component);
  const columnStyle = (index: number, textAlign: 'left' | 'center' | 'right'): Style => ({
    flexBasis: 0,
    flexGrow: ratios[index],
    flexShrink: 1,
    minWidth: 0,
    textAlign,
  });

  return (
    <View style={toPdfComponentStyle(component.style)}>
      <SectionTitle title={resolveTitle(component, context.locale)} icon={getSectionIcon(component)} context={context} />
      <View style={{ gap: cssSizeToPoints(context.spacing.sm, 4) }}>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          const subtitles = [
            getFieldValue(record, fields.leftSubtitle),
            getFieldValue(record, fields.centerSubtitle),
            getFieldValue(record, fields.rightSubtitle),
          ];
          const description = getFieldValue(record, fields.description);

          return (
            <View key={item.id || index}>
              <View wrap={false} minPresenceAhead={bodyFontSize * 2.5} style={{ flexDirection: 'row', gap: 8 }}>
                <Text style={[columnStyle(0, 'left'), { color: context.colors.text, fontSize: bodyFontSize, fontWeight: 700 }]}>
                  {getFieldValue(record, fields.leftTitle)}
                </Text>
                <Text style={[columnStyle(1, 'center'), { color: context.colors.text, fontSize: bodyFontSize, fontWeight: 700 }]}>
                  {getFieldValue(record, fields.centerTitle)}
                </Text>
                <Text style={[columnStyle(2, 'right'), { color: context.colors.text, fontSize: bodyFontSize, fontWeight: 700 }]}>
                  {getFieldValue(record, fields.rightTitle)}
                </Text>
              </View>
              {subtitles.some(Boolean) ? (
                <View wrap={false} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={[columnStyle(0, 'left'), { color: context.colors.text, fontSize: bodyFontSize }]}>{subtitles[0]}</Text>
                  <Text style={[columnStyle(1, 'center'), { color: context.colors.text, fontSize: bodyFontSize }]}>{subtitles[1]}</Text>
                  <Text style={[columnStyle(2, 'right'), { color: context.colors.text, fontSize: bodyFontSize }]}>{subtitles[2]}</Text>
                </View>
              ) : null}
              <Description
                value={description}
                color={context.colors.text}
                fontFamily={context.richTextFontFamily}
                fontSize={bodyFontSize}
                marginTop={description ? 2 : 0}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
};

const InlineKeyValueSectionBlock = ({ component, items, context }: {
  component: ComponentDefinition;
  items: SectionItem[];
  context: RenderContext;
}) => {
  const fields = component.fieldMap ?? {};
  const bodyFontSize = cssSizeToPoints(context.typography.fontSize.sm, 9);
  const suffix = typeof component.props?.labelSuffix === 'string' ? component.props.labelSuffix : ':';

  return (
    <View style={toPdfComponentStyle(component.style)}>
      <SectionTitle title={resolveTitle(component, context.locale)} icon={getSectionIcon(component)} context={context} />
      <View style={{ gap: cssSizeToPoints(context.spacing.xs, 2) }}>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          const label = getFieldValue(record, fields.itemName);
          const detail = getFieldValue(record, fields.summary) || getFieldValue(record, fields.itemDetail);
          const renderedLabel = /[:：]$/.test(label) ? label : `${label}${suffix}`;

          return (
            <View key={item.id || index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 3 }}>
              {label ? (
                <Text style={{ color: context.colors.text, fontSize: bodyFontSize, fontWeight: 700, flexShrink: 0 }}>
                  {renderedLabel}
                </Text>
              ) : null}
              {detail ? (
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <PdfRichText
                    html={detail}
                    color={context.colors.text}
                    fontFamily={context.richTextFontFamily}
                    fontSize={bodyFontSize}
                    lineHeight={1.35}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const CompactListBlock = ({ component, items, sidebar, context }: {
  component: ComponentDefinition;
  items: SectionItem[];
  sidebar: boolean;
  context: RenderContext;
}) => {
  const fields: FieldMapping = component.fieldMap ?? {};
  const color = component.style?.color ?? (sidebar ? context.colors.background : context.colors.text);
  const levelBar = Boolean(component.props?.levelBar);
  const trackColor = sidebar ? 'rgba(255,255,255,0.22)' : context.colors.border;
  const fillColor = sidebar ? context.colors.background : context.colors.primary;
  return (
    <View style={toPdfComponentStyle(component.style)}>
      <SectionTitle
        title={resolveTitle(component, context.locale)}
        icon={getSectionIcon(component)}
        sidebar={sidebar}
        color={color}
        dividerColor={color}
        context={context}
      />
      <View style={{ gap: 7 }}>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          const name = getFieldValue(record, fields.title ?? ['name', 'skill', 'language', 'certificate']);
          const level = getFieldValue(record, fields.level ?? 'level');
          const frac = levelBar ? skillLevelToFraction(level) : null;
          return (
            <View key={item.id || index} wrap={false} style={{ gap: 2 }}>
              <Text style={{ color, fontSize: 8.5, fontWeight: 700 }}>{name}</Text>
              {frac !== null ? (
                <View style={{ height: 3.5, borderRadius: 2, backgroundColor: trackColor, marginTop: 1 }}>
                  <View style={{ width: `${Math.round(frac * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: fillColor }} />
                </View>
              ) : level ? (
                <Text style={{ color, fontSize: 7.5, opacity: 0.8 }}>{level}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
};

const TimelineBlock = ({ component, items, context }: {
  component: ComponentDefinition;
  items: SectionItem[];
  context: RenderContext;
}) => {
  const fields = component.fieldMap ?? {};
  const color = component.style?.color ?? context.colors.text;
  const dateFontFamily = getPdfFontStack(context.typography.fontFamily.primary, context.cjkFallback);
  return (
    <View style={toPdfComponentStyle(component.style)}>
      <SectionTitle
        title={resolveTitle(component, context.locale)}
        icon={getSectionIcon(component)}
        color={color}
        dividerColor={context.colors.primary}
        context={context}
      />
      <View style={{ gap: cssSizeToPoints(context.spacing.md, 8) }}>
        {items.map((item, index) => {
          const record = item as Record<string, unknown>;
          const title = getFieldValue(record, fields.title ?? ['company', 'school', 'name']);
          const subtitle = getFieldValue(record, fields.subtitle ?? ['position', 'degree', 'role']);
          const date = getFieldValue(record, fields.date ?? 'date');
          const location = getFieldValue(record, ['location']);
          const description = getFieldValue(record, fields.description ?? ['summary', 'description']);
          return (
            <View key={item.id || index} wrap={false} style={{ flexDirection: 'row', gap: 7 }}>
              <View style={{ alignItems: 'center', width: 7 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: context.colors.primary, marginTop: 2 }} />
                {index < items.length - 1 ? <View style={{ width: 0.75, flexGrow: 1, minHeight: 18, backgroundColor: context.colors.border }} /> : null}
              </View>
              <View style={{ flexGrow: 1, flexShrink: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flexGrow: 1, flexShrink: 1, gap: 1 }}>
                    <Text style={{ color, fontSize: 9, fontWeight: 700 }}>{title}</Text>
                    {subtitle ? <Text style={{ color: context.colors.primary, fontSize: 8, fontWeight: 700 }}>{subtitle}</Text> : null}
                    {location ? <Text style={{ color, fontSize: 7.5, opacity: 0.75 }}>{location}</Text> : null}
                  </View>
                  <DateText
                    value={date}
                    color={color}
                    fontFamily={dateFontFamily}
                    fontSize={7.5}
                    opacity={0.75}
                    textAlign="right"
                  />
                </View>
                <Description
                  value={description}
                  color={color}
                  fontFamily={context.richTextFontFamily}
                  marginTop={4}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const ComponentBlock = ({ component, data, sidebar, context }: {
  component: ComponentDefinition;
  data: Resume;
  sidebar: boolean;
  context: RenderContext;
}) => {
  if (component.dataBinding === 'info') {
    if (component.type === 'ProfileCard') return <ProfileBlock info={data.info} component={component} sidebar={sidebar} context={context} />;
    if (component.type === 'ContactInfo') return <ContactBlock info={data.info} component={component} sidebar={sidebar} context={context} />;
    if (component.type === 'CenteredPhotoHeader') return <CenteredPhotoHeaderBlock info={data.info} component={component} context={context} />;
    return <HeaderBlock info={data.info} component={component} context={context} />;
  }

  const items = getSectionItems(data, component.dataBinding);
  if (items.length === 0) return null;

  if (component.type === 'CompactList') return <CompactListBlock component={component} items={items} sidebar={sidebar} context={context} />;
  if (component.type === 'Timeline') return <TimelineBlock component={component} items={items} context={context} />;
  if (component.type === 'ThreeColumnSection') return <ThreeColumnSectionBlock component={component} items={items} context={context} />;
  if (component.type === 'InlineKeyValueSection') return <InlineKeyValueSectionBlock component={component} items={items} context={context} />;
  if (component.type === 'ListSection') return <ListSectionBlock component={component} items={items} context={context} />;
  return <DefaultSectionBlock component={component} items={items} context={context} />;
};

export const MagicResumePdfDocument = ({ data, template, locale, cjkFallback = false }: MagicResumePdfDocumentProps) => {
  const { colors, typography, spacing } = template.designTokens;
  // 页宽 / 模块间距取自 layout(自定义面板的容器宽度 / 模块间距滑杆写入处),
  // 缺省回落 A4 宽与 spacing.lg —— 硬编码会让这两项自定义静默失效。
  // 模块间距用父容器 gap 而非各块 marginBottom:与 HTML 渲染器 flex gap 语义一致,
  // 组件自身 style 的 margin(如 classic header 的 8px)是叠加而不是覆盖。
  const pageWidth = cssSizeToPoints(template.layout.containerWidth, FREE_FORM_PAGE_SIZE.width);
  const sectionGap = cssSizeToPoints(template.layout.gap, cssSizeToPoints(spacing.lg, 12));
  const context: RenderContext = {
    colors,
    typography,
    spacing,
    showTitleDivider: template.layout.showTitleDivider !== false,
    showTitleIcon: template.layout.showTitleIcon !== false,
    richTextFontFamily: getPdfRichTextFontFamily(typography.fontFamily.primary, cjkFallback),
    cjkFallback,
    locale,
  };
  const sorted = sortComponents(template, data);
  const sidebar = sorted.filter((component) => component.position?.area === 'sidebar');
  const main = sorted.filter((component) => component.position?.area !== 'sidebar');
  const lineHeight = typography.lineHeight ?? 1.5;
  const baseStyle: Style = {
    backgroundColor: colors.background,
    color: colors.text,
    fontFamily: getPdfFontStack(typography.fontFamily.primary, cjkFallback) as unknown as string,
    fontSize: cssSizeToPoints(typography.fontSize.sm, 9),
    lineHeight,
    // 字距:HTML 渲染器一直消费,PDF 之前漏读 → 编辑器主画布(PDF)里字距滑杆无效。
    letterSpacing: cssSizeToPoints(typography.letterSpacing, 0),
  };
  const padding = cssSizeToPoints(template.layout.padding, 24);
  const columnGap = cssSizeToPoints(template.layout.twoColumn?.gap, 0);
  // 两栏主列用显式宽度(页宽 − 侧栏 − 列间距),不靠 flexGrow ——
  // react-pdf 4.5.1 的 flex 对 flexGrow+minWidth:0 收敛不稳,长文本会把主列撑出页面被裁。
  const sidebarWidth = cssSizeToPoints(template.layout.twoColumn?.leftWidth);
  const mainColumnWidth = Math.max(0, pageWidth - sidebarWidth - columnGap);
  // 两栏列的 padding 下限:azurill/orange/… 把 layout.padding 设成 "0",导致内容(含顶部、
  // 侧栏)直接贴页边、没边距。给个 24pt 下限保证四周都有内边距;侧栏底色在 View 上、padding
  // 在其内,所以底色照样铺满到页边。已有 ≥24 的模板(chikorita/gengar)不受影响。
  const columnPadding = Math.max(padding, 24);
  // 同理 azurill/orange/golden/teal 的 layout.gap:"0" → 分区零间距、挤成一团(尤其侧栏紧凑分区)。
  // 给两栏列的分区间距设 12pt 下限(gap:24px 的 chikorita/gengar=18pt 不受影响;单栏不动,
  // 保留 compact-cn-photo 故意的 0 间距)。
  const columnSectionGap = Math.max(sectionGap, 12);
  const pageSize = { width: pageWidth };
  const pageMinHeightStyle: Style = {
    minHeight: getFreeFormPageMinHeight(pageWidth, template.layout.pageSize),
  };

  return (
    <Document
      author={data.info.fullName}
      creator="Magic Resume"
      language={locale ?? 'zh-CN'}
      producer="Magic Resume"
      subject={data.info.headline}
      title={data.name || data.info.fullName}
    >
      {template.layout.type === 'two-column' && template.layout.twoColumn ? (
        <Page
          size={pageSize}
          style={[baseStyle, pageMinHeightStyle, { flexDirection: 'row', gap: columnGap }]}
        >
          <View
            style={{
              width: sidebarWidth,
              flexShrink: 0,
              backgroundColor: colors.sidebar ?? colors.primary,
              padding: columnPadding,
              gap: columnSectionGap,
            }}
          >
            {sidebar.map((component) => <ComponentBlock key={component.id} component={component} data={data} sidebar context={context} />)}
          </View>
          <View
            style={{
              width: mainColumnWidth,
              flexShrink: 1,
              minWidth: 0,
              padding: columnPadding,
              gap: columnSectionGap,
            }}
          >
            {main.map((component) => <ComponentBlock key={component.id} component={component} data={data} sidebar={false} context={context} />)}
          </View>
        </Page>
      ) : (
        <Page size={pageSize} style={[baseStyle, pageMinHeightStyle]}>
          <View style={{ padding, gap: sectionGap }}>
            {main.map((component) => <ComponentBlock key={component.id} component={component} data={data} sidebar={false} context={context} />)}
          </View>
        </Page>
      )}
    </Document>
  );
};
