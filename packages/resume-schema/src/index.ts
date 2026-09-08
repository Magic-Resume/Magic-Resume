import { z } from 'zod';

export const templateIds = [
  'classic',
  'azurill',
  'bronzor',
  'chikorita',
  'ditto',
  'gengar',
  'orange-modern',
  'clean-minimal',
  'teal-professional',
  'red-accent',
  'golden-elegant',
  'product-ops-focus',
  'compact-cn-photo',
  'executive-band',
  'timeline-pro',
  'skills-first',
  'serif-minimal',
  'slate-sidebar',
  'cn-formal-photo',
] as const;

export const templateSchema = z.enum(templateIds);

/** Shared persisted template customization contract used by web and PDF. */
export type CustomTemplateConfig = {
  designTokens?: {
    colors?: Partial<{
      primary: string;
      secondary: string;
      text: string;
      textSecondary: string;
      background: string;
      border: string;
      accent: string;
      sidebar: string;
    }>;
    typography?: {
      fontFamily?: {
        primary?: string;
        secondary?: string;
        mono?: string;
      };
      fontSize?: Partial<{
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        xxl: string;
      }>;
      fontWeight?: Partial<{
        normal: number;
        medium: number;
        bold: number;
      }>;
      lineHeight?: number;
      letterSpacing?: string;
    };
    spacing?: Partial<{
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
    }>;
    borderRadius?: Partial<{
      none: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
    }>;
  };
  layout?: {
    type?: 'single-column' | 'two-column' | 'sidebar' | 'grid';
    pageSize?: 'A4' | 'Letter';
    containerWidth?: string;
    containerHeight?: string;
    padding?: string;
    gap?: string;
    twoColumn?: {
      leftWidth?: string;
      rightWidth?: string;
      gap?: string;
    };
    sidebar?: {
      position?: 'left' | 'right';
      width?: string;
      gap?: string;
    };
    showTitleDivider?: boolean;
    showTitleIcon?: boolean;
  };
  header?: {
    avatarPosition?: 'left' | 'right';
    avatarWidth?: number;
    avatarHeight?: number;
    avatarRounded?: boolean;
    contactStyle?: 'icon' | 'label';
  };
};

export const customInfoFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
  // Persist the registry name, never a React component. The renderer still
  // validates it against its own safe icon registry before drawing.
  icon: z.string().optional(),
});

// Reject the URL schemes that make a rendered <a href> executable (defense in
// depth behind the render-layer safeHref guard). Scheme-less domains and empty
// strings stay valid so existing resumes and the default resume still parse.
const UNSAFE_URL_SCHEME = /^\s*(?:javascript|data|vbscript):/i;
const safeUrlString = z.string().refine((v) => !UNSAFE_URL_SCHEME.test(v), {
  message: 'URL must not use a javascript:, data:, or vbscript: scheme',
});

export const infoSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  email: z.string(),
  phoneNumber: z.string(),
  address: z.string(),
  website: safeUrlString,
  avatar: z.string(),
  customFields: z.array(customInfoFieldSchema).optional(),
});

export const sectionItemSchema = z
  .object({
    id: z.string(),
    visible: z.boolean(),
  })
  .catchall(z.unknown());

export const sectionOrderItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  /**
   * Icon name from `SECTION_ICONS` in @magic-resume/resume-templates. A name
   * rather than a component because a resume is persisted, synced and exported
   * as JSON. Absent means "guess" — the renderer still matches on the section
   * key and on keywords in the title.
   */
  icon: z.string().optional(),
});

export const resumeSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  name: z.string(),
  updatedAt: z.number().optional(),
  info: infoSchema,
  sections: z.record(z.array(sectionItemSchema)),
  sectionOrder: z.array(sectionOrderItemSchema),
  template: templateSchema.catch('classic'),
  customTemplate: z.record(z.unknown()).optional(),
  /**
   * 整棵模板树。有它就**完全接管渲染**——不再走 `template` 指向的注册模板。
   *
   * 存在简历上而不是建一张模板表，是有意的：第一波要验证的是「复刻出来的版式能用」，
   * 不是「模板能分享」。分享与画廊是独立的产品决定，留到以后。
   *
   * 形状不在这里约束（`z.unknown()`）：真正的校验在
   * `@magic-resume/resume-templates` 的 `validateTemplate` + JSON Schema 里，
   * 在这里再写一份 Zod 版就是第二份会漂的定义。渲染器拿到坏树会降级成不渲染，
   * 不会崩——所以这里放行、那里把关是安全的分工。
   */
  templateOverride: z.unknown().optional(),
  themeColor: z.string(),
  typography: z.string(),
  isPublic: z.boolean().optional(),
  shareId: z.string().optional(),
  shareRole: z.enum(['VIEWER', 'COMMENTER', 'EDITOR']).optional(),
});

export const resumeUpdateBaseSchema = z.object({
  resumeId: z.string(),
  expectedUpdatedAt: z.number().optional(),
  changelog: z.string().optional(),
});

export const updateInfoInputSchema = resumeUpdateBaseSchema.extend({
  info: infoSchema.partial(),
});

export const updateSectionItemsInputSchema = resumeUpdateBaseSchema.extend({
  sectionKey: z.string(),
  items: z.array(sectionItemSchema),
});

export const reorderSectionsInputSchema = resumeUpdateBaseSchema.extend({
  sectionOrder: z.array(sectionOrderItemSchema),
});

export const updateTemplateInputSchema = resumeUpdateBaseSchema.extend({
  template: templateSchema.optional(),
  themeColor: z.string().optional(),
  typography: z.string().optional(),
  customTemplate: z.record(z.unknown()).optional(),
  /**
   * 整棵模板树。有它就**完全接管渲染**——不再走 `template` 指向的注册模板。
   *
   * 存在简历上而不是建一张模板表，是有意的：第一波要验证的是「复刻出来的版式能用」，
   * 不是「模板能分享」。分享与画廊是独立的产品决定，留到以后。
   *
   * 形状不在这里约束（`z.unknown()`）：真正的校验在
   * `@magic-resume/resume-templates` 的 `validateTemplate` + JSON Schema 里，
   * 在这里再写一份 Zod 版就是第二份会漂的定义。渲染器拿到坏树会降级成不渲染，
   * 不会崩——所以这里放行、那里把关是安全的分工。
   */
  templateOverride: z.unknown().optional(),
});

const defaultSectionKeys = [
  'experience',
  'education',
  'projects',
  'skills',
  'languages',
  'certificates',
  'profiles',
] as const;

export const defaultResume = {
  name: 'Untitled Resume',
  info: {
    fullName: '',
    headline: '',
    email: '',
    phoneNumber: '',
    address: '',
    website: '',
    avatar: '',
    customFields: [],
  },
  sections: Object.fromEntries(defaultSectionKeys.map((key) => [key, []])),
  sectionOrder: defaultSectionKeys.map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
  })),
  template: 'classic',
  customTemplate: {},
  themeColor: '#f97316',
  typography: 'inter',
} satisfies Resume;

export const sampleResume = {
  ...defaultResume,
  name: 'Sample Resume',
  info: {
    ...defaultResume.info,
    fullName: 'Alex Chen',
    headline: 'Product-minded Frontend Engineer',
    email: 'alex@example.com',
    phoneNumber: '+1 555 0100',
    address: 'San Francisco, CA',
    website: 'https://example.com',
  },
  sections: {
    ...defaultResume.sections,
    experience: [
      {
        id: 'sample-experience-1',
        visible: true,
        company: 'Magic Labs',
        position: 'Frontend Engineer',
        location: 'Remote',
        date: '2023 - Present',
        summary:
          '<p>Built polished resume editing workflows with TypeScript, React, and structured AI assistance.</p>',
      },
    ],
    projects: [
      {
        id: 'sample-project-1',
        visible: true,
        name: 'Magic Resume MCP',
        description:
          '<p>Connected resume data to AI coding tools through schema-aware JSON Patch operations.</p>',
      },
    ],
    skills: [
      {
        id: 'sample-skill-1',
        visible: true,
        name: 'TypeScript',
        level: 'Advanced',
      },
    ],
  },
} satisfies Resume;

export const resumeJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://magic-resume.cn/schema/resume.schema.json',
  title: 'Magic Resume',
  type: 'object',
  additionalProperties: true,
  required: [
    'name',
    'info',
    'sections',
    'sectionOrder',
    'template',
    'themeColor',
    'typography',
  ],
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    name: { type: 'string' },
    updatedAt: { type: 'number' },
    info: {
      type: 'object',
      required: [
        'fullName',
        'headline',
        'email',
        'phoneNumber',
        'address',
        'website',
        'avatar',
      ],
      properties: {
        fullName: { type: 'string' },
        headline: { type: 'string' },
        email: { type: 'string' },
        phoneNumber: { type: 'string' },
        address: { type: 'string' },
        website: { type: 'string' },
        avatar: { type: 'string' },
        customFields: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'name', 'value'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
    },
    sections: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'visible'],
          additionalProperties: true,
          properties: {
            id: { type: 'string' },
            visible: { type: 'boolean' },
          },
        },
      },
    },
    sectionOrder: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'label'],
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
        },
      },
    },
    template: { type: 'string', enum: [...templateIds], default: 'classic' },
    customTemplate: { type: 'object', additionalProperties: true },
    themeColor: { type: 'string' },
    typography: { type: 'string' },
    isPublic: { type: 'boolean' },
    shareId: { type: 'string' },
    shareRole: { type: 'string', enum: ['VIEWER', 'COMMENTER', 'EDITOR'] },
  },
} as const;

export type TemplateId = z.infer<typeof templateSchema>;
export type CustomInfoField = z.infer<typeof customInfoFieldSchema>;
export type Info = z.infer<typeof infoSchema>;

/** Open-ended section fields are intentionally string/boolean-like for form
 * rendering; runtime validation remains the Zod schema above. */
export type SectionItem = {
  id: string;
  visible: boolean;
  customFields?: CustomInfoField[];
  [key: string]: string | boolean | CustomInfoField[] | undefined;
};
export type Section = Record<string, SectionItem[]>;
export type SectionOrderItem = {
  key: string;
  label: string;
  icon?: string;
};
export type Resume = {
  id?: string;
  userId?: string;
  name: string;
  updatedAt?: number;
  info: Info;
  sections: Section;
  sectionOrder: SectionOrderItem[];
  /** Runtime validation uses templateSchema; string keeps legacy custom ids
   * type-compatible at the app boundary. */
  template: string;
  customTemplate?: CustomTemplateConfig;
  templateOverride?: unknown;
  themeColor: string;
  typography: string;
  isPublic?: boolean;
  shareId?: string;
  shareRole?: 'VIEWER' | 'COMMENTER' | 'EDITOR';
};
export type ResumeUpdateBase = z.infer<typeof resumeUpdateBaseSchema>;
export type UpdateInfoInput = z.infer<typeof updateInfoInputSchema>;
export type UpdateSectionItemsInput = z.infer<
  typeof updateSectionItemsInputSchema
>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsInputSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>;
