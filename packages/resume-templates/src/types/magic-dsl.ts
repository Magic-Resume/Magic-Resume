// Magic模板DSL设计
export interface MagicTemplateDSL {
  id: string;
  name: string;
  version: string;
  description: string;
  thumbnailUrl: string;
  tags: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  
  // 设计令牌系统
  designTokens: {
    colors: {
      primary: string;
      secondary: string;
      text: string;
      textSecondary: string;
      background: string;
      border: string;
      accent?: string;
      sidebar?: string;
    };
    typography: {
      fontFamily: {
        primary: string;
        secondary?: string;
        mono?: string;
      };
      fontSize: {
        xs: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        xxl: string;
      };
      fontWeight: {
        normal: number;
        medium: number;
        bold: number;
      };
      lineHeight?: number;
      letterSpacing?: string;
    };
    spacing: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
    };
    borderRadius: {
      none: string;
      sm: string;
      md: string;
      lg: string;
    };
  };
  
  // 布局系统
  layout: {
    type: 'single-column' | 'two-column' | 'sidebar' | 'grid';
    /** 纸张规格,决定页面纵横比(高度 = 宽度 × 比例)。缺省按 A4。 */
    pageSize?: 'A4' | 'Letter';
    containerWidth: string;
    containerHeight?: string;
    padding: string;
    gap: string;
    
    // 两栏布局配置
    twoColumn?: {
      leftWidth: string;
      rightWidth: string;
      gap: string;
    };
    
    // 侧边栏布局配置
    sidebar?: {
      position: 'left' | 'right';
      width: string;
      gap: string;
    };

    showTitleDivider?: boolean;
    showTitleIcon?: boolean;
  };
  
  // 组件定义
  components: ComponentDefinition[];
}

export interface ComponentDefinition {
  id: string;
  type: ComponentType;
  dataBinding: string;
  position: ComponentPosition;
  props?: Record<string, unknown>;
  style?: ComponentStyle;
  fieldMap?: FieldMapping;
  /**
   * 原语树。**给了它就走新路径**（`type` 必须是 `'Tree'`），两个渲染器都改为
   * 编译这棵树，而不是去注册表里找组件。
   *
   * 这是绞杀榕的接缝：新旧两条路并存，旧的 19 个模板一个字都不用改。
   * 类型写成 `unknown` 是为了不让本文件依赖 `primitives/`——那边导入这边的
   * `ComponentType`，反向再导一次就成环了。渲染器侧各自窄化。
   */
  tree?: unknown;
}

export type ComponentType = 
  | 'Header'
  | 'CenteredPhotoHeader'
  | 'DefaultSection'
  | 'ThreeColumnSection'
  | 'InlineKeyValueSection'
  | 'ClassicHeader'
  | 'ClassicSection'
  | 'ClassicSkills'
  | 'Section'
  | 'ListSection' 
  | 'ProfileCard'
  | 'ContactInfo'
  | 'Timeline'
  | 'CompactList'
  | 'Divider'
  /** 走原语树，见 `ComponentDefinition.tree`。 */
  | 'Tree';

export interface ComponentPosition {
  area?: 'main' | 'sidebar' | 'header' | 'footer';
  order?: number;
}

export interface ComponentStyle {
  backgroundColor?: string;
  color?: string;
  padding?: string;
  margin?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  borderRadius?: string;
  fontSize?: string;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  border?: string;
  boxShadow?: string;
}

export interface FieldMapping {
  title?: string | string[];
  subtitle?: string | string[];
  description?: string | string[];
  date?: string | string[];
  level?: string | string[];
  
  // 扩展字段，用于更复杂的组件
  mainTitle?: string | string[];
  mainSubtitle?: string | string[];
  secondarySubtitle?: string | string[];
  sideTitle?: string | string[];
  sideSubtitle?: string | string[];
  secondarySideSubtitle?: string | string[];

  // ThreeColumnSection fields
  leftTitle?: string | string[];
  leftSubtitle?: string | string[];
  centerTitle?: string | string[];
  centerSubtitle?: string | string[];
  rightTitle?: string | string[];
  rightSubtitle?: string | string[];
  
  // ListSection字段
  itemName?: string | string[];
  itemDetail?: string | string[];
  summary?: string | string[];
  
  custom?: Record<string, string | string[]>;
}
