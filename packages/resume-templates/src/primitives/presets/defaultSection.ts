import type { TemplateDocument, TemplateNode } from '../ast';
import type { StyleRef } from '../style';

/**
 * 第一个预设：把 `templateLayout/DefaultSection.tsx` 用原语重写一遍。
 *
 * ## 它存在的意义是验证，不是替换
 *
 * 19 个旧模板**一行不改**，仍走 legacy 组件。这份预设是「同一个版式能不能只用
 * 词汇表表达出来」的证据——表达不出来，说明词汇表缺东西，那才是要修的地方。
 * 事实上写这份预设的过程就逼出了两个缺口：编辑锚点缺 `label`（原来的「工作经历 ·
 * 第 2 条」我合成不出来），以及区块手柄 / 插入槽在 IR 里无处安放。
 *
 * ## 为什么参数吃的是数值而不是 CSS 变量
 *
 * legacy 组件通篇写 `var(--font-size-title)`，靠 `MagicResumeRenderer` 在外层
 * 注入。**react-pdf 解析不了 `var()`**——它没有层叠、没有继承链，拿到这个字符串
 * 只会当成无效值丢掉。所以预设收的是已经解析好的数值（单位 CSS px），
 * 由调用方负责把 designTokens 换算过来。
 *
 * 这不是妥协，是把一个原本只在屏幕上成立的假设显式化：**能进模板树的，必须是
 * 两个后端都能理解的东西。**
 */

/** 已解析的设计 token。全部是 CSS px 数值——不接受 `'12px'` 这种字符串。 */
export interface PresetTokens {
  primary: string;
  text: string;
  bodyFontSize: number;
  titleFontSize: number;
  lineHeight: number;
  /** 分区之间 */
  sectionSpacing: number;
  /** 标题与正文之间 */
  sectionTitleSpacing: number;
  /** 条目之间 */
  paragraphSpacing: number;
  /** 0 表示不画标题下划线 */
  titleDividerWidth: number;
  showTitleIcon: boolean;
}

export interface DefaultSectionParams {
  sectionKey: string;
  title: string;
  /** 与 legacy 的 `fieldMap` 同构，直接复用模板里已有的那份。 */
  fieldMap: Record<string, string | string[] | undefined>;
  tokens: PresetTokens;
  /** `sectionIcons` 里的名字。`showTitleIcon` 为假时忽略。 */
  iconName?: string;
}

/**
 * 一列文本。缺字段的那几行会在编译期整行消失（`resolveValue` 取不到值就不产出节点），
 * 所以这里不需要写 `when`——**空洞是编译器的责任，不是模板作者的**。
 */
const textColumn = (
  idPrefix: string,
  fields: Array<{ key: string; binding: string | string[] | undefined; bold?: boolean }>,
  align: 'left' | 'right',
  columnStyle: StyleRef[],
): TemplateNode => ({
  id: `${idPrefix}-col`,
  type: 'Box',
  style: columnStyle,
  children: fields
    .filter((f) => f.binding !== undefined)
    .map<TemplateNode>((f) => ({
      id: `${idPrefix}-${f.key}`,
      type: 'Text',
      value: { read: f.binding as string | string[] },
      style: [{ textAlign: align, ...(f.bold ? { fontWeight: 700 } : {}) }],
    })),
});

export function defaultSectionPreset(params: DefaultSectionParams): TemplateDocument {
  const { sectionKey, title, fieldMap, tokens, iconName } = params;
  const p = `${sectionKey}`;

  const heading: TemplateNode = {
    id: `${p}-heading`,
    type: 'Box',
    // 手柄挂在标题上，与 legacy 一致——用户去改分区名时眼睛正看着这里。
    section: { sectionKey, title, handle: true },
    style: [
      {
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.titleFontSize * 0.4,
        marginBottom: tokens.sectionTitleSpacing,
        paddingBottom: tokens.sectionTitleSpacing,
        // 逐边 border：8 个模板的小节横线就是这一条，画成独立的分隔节点会多出
        // 一个兄弟元素、把标题与正文之间的间距算错。
        borderBottomWidth: tokens.titleDividerWidth,
        borderStyle: 'solid',
        borderColor: tokens.primary,
      },
    ],
    children: [
      ...(tokens.showTitleIcon && iconName
        ? [
            {
              id: `${p}-icon`,
              type: 'Icon' as const,
              name: iconName,
              size: tokens.titleFontSize,
              style: [{ color: tokens.primary }] as StyleRef[],
            },
          ]
        : []),
      {
        id: `${p}-title`,
        type: 'Text',
        role: 'sectionHeading',
        value: title,
        style: [{ color: tokens.primary, fontSize: tokens.titleFontSize }],
      },
    ],
  };

  const item: TemplateNode = {
    id: `${p}-item`,
    each: { path: `sections.${sectionKey}` },
    type: 'Box',
    style: [{ gap: tokens.bodyFontSize * 0.5 }],
    children: [
      {
        id: `${p}-row`,
        type: 'Box',
        style: [{ flexDirection: 'row', alignItems: 'flex-start' }],
        children: [
          textColumn(
            `${p}-main`,
            [
              { key: 'mainTitle', binding: fieldMap.mainTitle, bold: true },
              { key: 'mainSubtitle', binding: fieldMap.mainSubtitle },
              { key: 'secondarySubtitle', binding: fieldMap.secondarySubtitle },
            ],
            'left',
            [{ flexGrow: 1 }],
          ),
          textColumn(
            `${p}-side`,
            [
              { key: 'sideTitle', binding: fieldMap.sideTitle, bold: true },
              { key: 'sideSubtitle', binding: fieldMap.sideSubtitle },
              { key: 'secondarySideSubtitle', binding: fieldMap.secondarySideSubtitle },
            ],
            'right',
            [{ flexShrink: 0 }],
          ),
        ],
      },
      {
        // 用户手加的字段。legacy 里是显式写死的一段 JSX，这里是一条 `each`——
        // 少一处只有读过源码才知道存在的特例。
        id: `${p}-custom`,
        type: 'Box',
        style: [{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.bodyFontSize * 0.6 }],
        children: [
          {
            id: `${p}-custom-entry`,
            each: { path: 'customFields', as: 'field' },
            type: 'Box',
            when: { or: [{ exists: 'field.name' }, { exists: 'field.value' }] },
            style: [{ flexDirection: 'row' }],
            children: [
              {
                // 冒号跟着字段名走。写成 `{{name}}：{{value}}` 一把梭的话，
                // 只填了值没填名的那条会渲成「：某某」——多一个无主的冒号。
                id: `${p}-custom-name`,
                type: 'Text',
                when: { exists: 'field.name' },
                value: '{{field.name}}：',
                style: [{ fontWeight: 700 }],
              },
              { id: `${p}-custom-value`, type: 'Text', value: { read: 'field.value' } },
            ],
          },
        ],
      },
      {
        id: `${p}-desc`,
        type: 'RichText',
        value: { read: fieldMap.description ?? 'description' },
      },
    ],
  };

  return {
    version: 1,
    root: {
      id: `${p}-section`,
      type: 'Box',
      // 插入槽落在条目容器末尾，位置与 legacy 相同。
      section: { sectionKey, title, insertSlot: true },
      style: [
        {
          marginBottom: tokens.sectionSpacing,
          fontSize: tokens.bodyFontSize,
          lineHeight: tokens.lineHeight,
          color: tokens.text,
          gap: tokens.paragraphSpacing,
        },
      ],
      children: [heading, item],
    },
  };
}
