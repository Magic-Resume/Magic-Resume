export type CustomTemplateConfig = {
  designTokens?: {
    colors?: Partial<{
      primary: string;
      secondary: string;
      text: string;
      textSecondary: string;
      background: string;
      border: string;
      accent?: string;
      sidebar?: string;
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
  /** 头像 / 页眉样式覆盖,合并进 Header / ProfileCard 组件的 props。 */
  header?: {
    avatarPosition?: 'left' | 'right';
    avatarWidth?: number;
    avatarHeight?: number;
    avatarRounded?: boolean;
    contactStyle?: 'icon' | 'label';
  };
};

export type CustomInfoField = {
  id: string;
  name: string;
  value: string;
  icon?: string;
};

export type InfoType = {
  fullName: string;
  headline: string;
  email: string;
  phoneNumber: string;
  address: string;
  website: string;
  avatar: string;
  customFields?: CustomInfoField[];
};

/** Name/value pairs a user added to one item. */
export type CustomItemField = {
  id: string;
  name: string;
  value: string;
};

export type SectionItem = {
  id: string;
  visible: boolean;
  /**
   * Rendered by an explicit block rather than through a template's fieldMap:
   * `getFieldValue` silently drops any key a fieldMap does not declare, so a
   * field the user typed has to be one the renderer knows to look for.
   */
  customFields?: CustomItemField[];
  [key: string]: string | boolean | CustomItemField[] | undefined;
};

export type Section = {
  [key: string]: SectionItem[];
};

export type SectionOrder = {
  key: string;
  label: string;
};

export type Resume = {
  id: string;
  userId?: string;
  name: string;
  updatedAt: number;
  info: InfoType;
  sections: Section;
  sectionOrder: SectionOrder[];
  template: string;
  customTemplate?: CustomTemplateConfig;
  /**
   * 整棵模板树（原语层）。有它就完全接管渲染，不再走 `template` 指向的注册模板。
   * 形状不在这里约束——校验在 `primitives/validate.ts` 与 JSON Schema 里，
   * 在类型上再定义一份就是第二份会漂的定义。
   */
  templateOverride?: unknown;
  themeColor: string;
  typography: string;
  isPublic?: boolean;
  shareId?: string;
  shareRole?: 'VIEWER' | 'COMMENTER' | 'EDITOR';
};
