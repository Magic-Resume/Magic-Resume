import type { TemplateDocument, TemplateNode } from '../ast';
import type { StyleRef } from '../style';
import { UNHANDLED_SECTIONS } from '../compile';

/**
 * 「密集型技术简历」版式。
 *
 * 复刻自一份真实的算法岗简历版式。**只复刻版式，一个字的内容都没有抄**——
 * 参考件是真人的简历，所有文字在这里都是绑定，渲染出来的是**当前用户自己的**内容。
 * 这不只是合规要求：把参考件的正文写死进模板，用户打开看到的就是别人的经历。
 *
 * ## 这个版式与既有 19 个模板的区别在哪
 *
 * 逐条对应到词汇表里的一个能力，也正好是「为什么旧的封闭组件做不出它」的答案：
 *
 * | 版式特征 | 靠什么实现 | 旧组件为什么做不到 |
 * |---|---|---|
 * | 表头四行、每行一个图标 | `Box(row)` + `Icon` + `Text` | `Header` 是固定的姓名+一行联系方式 |
 * | 蓝色小节标题 + 整行横线 | `Text(role)` + Box 的 `borderBottomWidth` | 横线宽度是全局 token，不能按分区定 |
 * | 灰底圆角的公司条（带图标） | `backgroundColor` + `borderRadius` + `Icon` | `ComponentStyle` 的 `borderRadius` PDF 侧直接丢 |
 * | 一行内多字段用 `·` 分隔 | Box 的 `separator` | 只能靠在每项后面拼字符串，末尾会多一个 |
 * | 项目标题与公司条分两级 | 两层 Box 嵌套 | 区块组件只有「标题 + 条目」两级 |
 *
 * ## 正文为什么仍然是 RichText
 *
 * 参考件里那些多级要点、加粗前导词（「我的职责：」）、灰底行内代码，全都来自
 * **用户自己写的富文本**，不是模板结构。模板给的是框，内容归内容——
 * 把它们做进模板等于替用户决定他该写几级要点。
 */

export interface TechDenseTokens {
  /** 小节标题与链接的蓝。参考件用的是偏深的钢蓝。 */
  accent: string;
  text: string;
  muted: string;
  /** 公司条的灰底。 */
  barBackground: string;
  bodyFontSize: number;
  nameFontSize: number;
  sectionFontSize: number;
  lineHeight: number;
  pagePadding: number;
}

export const TECH_DENSE_TOKENS: TechDenseTokens = {
  accent: '#1d4ed8',
  text: '#111827',
  muted: '#4b5563',
  barBackground: '#f3f4f6',
  bodyFontSize: 9.5,
  nameFontSize: 22,
  sectionFontSize: 13,
  lineHeight: 1.45,
  pagePadding: 30,
};

export interface TechDenseParams {
  tokens?: TechDenseTokens;
  /** 分区标题。缺省用中文——版式来自中文简历，但不写死，英文用户能覆盖。 */
  titles?: { experience?: string; projects?: string; education?: string };
}

/**
 * 表头的一行：`图标 + 若干字段`，字段之间用 `·` 隔开。
 *
 * 字段取不到值时整个节点不渲染（编译器的行为），所以这里不需要写 `when`——
 * 少填一项就是少一段，不会留下孤零零的分隔符：`separator` 只插在**真实存在的**项之间。
 */
const contactRow = (
  id: string,
  icon: string,
  fields: Array<string | string[]>,
  tokens: TechDenseTokens,
): TemplateNode => ({
  id,
  type: 'Box',
  // 图标不能在所有字段为空时独自留下。候选链两端都放进条件，旧数据与
  // 当前 Resume 字段都能触发同一行；否则 PDF 顶部会只剩图标/分隔符的空行。
  when: { or: fields.flatMap((field) => (Array.isArray(field) ? field : [field])).map((exists) => ({ exists })) },
  style: [{ flexDirection: 'row', alignItems: 'center', gap: 5 }],
  children: [
    { id: `${id}-icon`, type: 'Icon', name: icon, size: tokens.bodyFontSize, style: [{ color: tokens.text }] },
    {
      id: `${id}-fields`,
      type: 'Box',
      style: [{ flexDirection: 'row', alignItems: 'center', gap: 5 }],
      separator: { id: `${id}-sep`, type: 'Text', value: '·', style: [{ color: '#9ca3af' }] },
      children: fields.map((read, i) => ({
        id: `${id}-f${i}`,
        type: 'Text' as const,
        value: { read },
      })),
    },
  ],
});

/** 蓝色小节标题 + 整行横线。横线是标题自己的 `borderBottom`，不是独立节点。 */
const sectionHeading = (
  id: string,
  title: string,
  tokens: TechDenseTokens,
  sectionKey: string,
): TemplateNode => ({
  id,
  type: 'Box',
  section: { sectionKey, title, handle: true },
  style: [
    {
      marginTop: 14,
      marginBottom: 6,
      paddingBottom: 2,
      // 独立的分隔节点会多出一个 flex 兄弟，把标题与正文之间的间距算错。
      borderBottomWidth: 1,
      borderStyle: 'solid',
      borderColor: tokens.text,
    },
  ],
  children: [
    {
      id: `${id}-text`,
      type: 'Text',
      role: 'sectionHeading',
      value: title,
      style: [{ color: tokens.accent, fontSize: tokens.sectionFontSize, fontWeight: 700 }],
    },
  ],
});

/** 灰底圆角的公司条：图标 + 加粗名称 + 右侧日期。 */
const companyBar = (id: string, icon: string, tokens: TechDenseTokens): TemplateNode => ({
  id,
  type: 'Box',
  style: [
    {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tokens.barBackground,
      borderRadius: 4,
      paddingTop: 4,
      paddingBottom: 4,
      paddingLeft: 8,
      paddingRight: 8,
      marginBottom: 5,
    },
  ],
  children: [
    { id: `${id}-icon`, type: 'Icon', name: icon, size: tokens.bodyFontSize + 1, style: [{ color: tokens.text }] },
    {
      id: `${id}-name`,
      type: 'Text',
      value: { read: ['company', 'name'] },
      style: [{ fontWeight: 700, flexGrow: 1 }],
    },
    { id: `${id}-date`, type: 'Text', value: { read: 'date' }, style: [{ color: tokens.muted }] },
  ],
});

/** 一条经历：公司条 + 蓝色副标题 + 正文。 */
const experienceItem = (tokens: TechDenseTokens): TemplateNode => ({
  id: 'exp-item',
  each: { path: 'sections.experience' },
  type: 'Box',
  style: [{ marginBottom: 8 }],
  children: [
    companyBar('exp-bar', 'briefcase', tokens),
    {
      id: 'exp-role',
      type: 'Text',
      value: { read: 'position' },
      style: [{ color: tokens.accent, fontWeight: 700, marginBottom: 3 }],
    },
    { id: 'exp-desc', type: 'RichText', value: { read: ['summary', 'description'] } },
  ],
});

const projectItem = (tokens: TechDenseTokens): TemplateNode => ({
  id: 'proj-item',
  each: { path: 'sections.projects' },
  type: 'Box',
  style: [{ marginBottom: 8 }],
  children: [
    {
      // 项目标题走 `href`，参考件里它是个蓝色带下划线的链接。
      // `href` 统一过 `safeHref`：不可信的 URL 在编译期就降级成纯文本，
      // 而不是生成一个能点的 `javascript:` 链接。
      id: 'proj-title',
      type: 'Text',
      value: { read: 'name' },
      href: { read: ['link', 'url', 'website'] },
      style: [
        {
          color: tokens.accent,
          fontWeight: 700,
          fontSize: tokens.bodyFontSize + 1,
          textDecoration: 'underline',
        },
      ],
    },
    {
      id: 'proj-meta',
      type: 'Box',
      style: [{ flexDirection: 'row', gap: 6, color: tokens.muted, marginBottom: 3 }],
      separator: { id: 'proj-meta-sep', type: 'Text', value: '·', style: [{ color: '#9ca3af' }] },
      children: [
        { id: 'proj-role', type: 'Text', value: { read: 'role' } },
        { id: 'proj-date', type: 'Text', value: { read: 'date' } },
      ],
    },
    { id: 'proj-desc', type: 'RichText', value: { read: ['summary', 'description'] } },
  ],
});

const educationItem = (tokens: TechDenseTokens): TemplateNode => ({
  id: 'edu-item',
  each: { path: 'sections.education' },
  type: 'Box',
  style: [{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 }],
  children: [
    { id: 'edu-school', type: 'Text', value: { read: 'school' }, style: [{ fontWeight: 700 }] },
    { id: 'edu-major', type: 'Text', value: { read: 'major' }, style: [{ flexGrow: 1 }] },
    { id: 'edu-date', type: 'Text', value: { read: 'date' }, style: [{ color: tokens.muted }] },
  ],
});

export function techDensePreset(params: TechDenseParams = {}): TemplateDocument {
  const tokens = params.tokens ?? TECH_DENSE_TOKENS;
  const titles = {
    experience: params.titles?.experience ?? '实习经历',
    projects: params.titles?.projects ?? '项目经历',
    education: params.titles?.education ?? '教育经历',
  };

  return {
    version: 1,
    root: {
      id: 'root',
      type: 'Box',
      style: [
        {
          padding: tokens.pagePadding,
          color: tokens.text,
          fontSize: tokens.bodyFontSize,
          lineHeight: tokens.lineHeight,
        },
      ],
      children: [
        // ── 表头 ──
        {
          id: 'name',
          type: 'Text',
          role: 'title',
          value: { read: 'info.fullName' },
          style: [{ fontSize: tokens.nameFontSize, fontWeight: 700, marginBottom: 5 }],
        },
        {
          id: 'contact',
          type: 'Box',
          style: [{ gap: 2, marginBottom: 2 }],
          children: [
            // 使用产品 Resume 的真实字段；旧实验室数据仍可通过第二候选继续渲染。
            contactRow('c-phone', 'phone', [['info.phoneNumber', 'info.phone'], 'info.email'], tokens),
            contactRow('c-who', 'user', [['info.headline', 'info.title'], ['info.address', 'info.location']], tokens),
            contactRow('c-link', 'globe', [['info.website', 'info.github']], tokens),
            {
              id: 'c-custom',
              type: 'Box',
              each: { path: 'info.customFields' },
              // 标题和值缺一不可；避免用户刚点“添加”时在简历上留下空行。
              when: { and: [{ exists: 'name' }, { exists: 'value' }] },
              style: [{ flexDirection: 'row', alignItems: 'center', gap: 5 }],
              children: [
                {
                  id: 'c-custom-icon',
                  type: 'Icon',
                  name: { read: 'icon' },
                  size: tokens.bodyFontSize,
                  style: [{ color: tokens.text }],
                },
                { id: 'c-custom-label', type: 'Text', value: '{{name}}：', style: [{ color: tokens.muted }] },
                { id: 'c-custom-value', type: 'Text', value: { read: 'value' } },
              ],
            },
          ],
        },

        // ── 实习经历 ──
        sectionHeading('exp-h', titles.experience, tokens, 'experience'),
        {
          id: 'exp-wrap',
          type: 'Box',
          section: { sectionKey: 'experience', title: titles.experience, insertSlot: true },
          children: [experienceItem(tokens)],
        },

        // ── 项目经历 ──
        sectionHeading('proj-h', titles.projects, tokens, 'projects'),
        {
          id: 'proj-wrap',
          type: 'Box',
          section: { sectionKey: 'projects', title: titles.projects, insertSlot: true },
          children: [projectItem(tokens)],
        },

        // ── 教育经历 ──
        sectionHeading('edu-h', titles.education, tokens, 'education'),
        {
          id: 'edu-wrap',
          type: 'Box',
          section: { sectionKey: 'education', title: titles.education, insertSlot: true },
          children: [educationItem(tokens)],
        },

        // ── 兜底 ──
        // 没有它，用户自建的分区（「获奖经历」「开源贡献」）**静默消失**：
        // 不报错、不警告，版面上只是少一块。
        {
          id: 'rest',
          type: 'Box',
          each: { path: UNHANDLED_SECTIONS },
          children: [
            {
              id: 'rest-h',
              type: 'Box',
              style: [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 14,
                  marginBottom: 6,
                  paddingBottom: 2,
                  borderBottomWidth: 1,
                  borderStyle: 'solid',
                  borderColor: tokens.text,
                },
              ],
              section: { sectionKey: '{{item.key}}', title: '{{item.key}}', handle: true },
              children: [
                {
                  id: 'rest-icon',
                  type: 'Icon',
                  name: { read: 'icon' },
                  size: tokens.sectionFontSize,
                  style: [{ color: tokens.accent }],
                },
                {
                  id: 'rest-title',
                  type: 'Text',
                  role: 'sectionHeading',
                  value: '{{item.key}}',
                  style: [
                    { color: tokens.accent, fontSize: tokens.sectionFontSize, fontWeight: 700 },
                  ] as StyleRef[],
                },
              ],
            },
            {
              id: 'rest-item',
              type: 'Box',
              each: { path: 'sections.{{item.key}}' },
              children: [
                { id: 'rest-name', type: 'Text', value: { read: ['name', 'title'] }, style: [{ fontWeight: 700 }] },
                { id: 'rest-desc', type: 'RichText', value: { read: ['summary', 'description'] } },
              ],
            },
          ],
        },
      ],
    },
  };
}
