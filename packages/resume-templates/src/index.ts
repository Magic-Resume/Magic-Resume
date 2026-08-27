export * from './config';
export * from './config/defaults';
export {
  defaultMagicTemplate,
  getMagicTemplates,
  magicTemplateList,
  magicTemplates,
} from './config/magic-templates';
export * from './registry';
export * from './sectionIcons';
export * from './renderer/MagicResumeRenderer';
export * from './types/magic-dsl';
export * from './types/resume';
export { default as TemplateCustomizer } from './TemplateCustomizer';

/**
 * 原语层。**新版式一律走这里**，legacy 组件已冻结（`scripts/check-legacy-freeze.mjs`）。
 *
 * 只导出消费方真正需要的：作者格式与校验（写模板 / 存模板）、编译与两个后端
 * （渲染）、复刻管线（AI）、归一化（保存路径）。编译器内部的 `Ctx` / `Scope`
 * 之类不导出——它们是实现细节，导出了就变成了别人可以依赖的契约。
 */
export type {
  TemplateDocument,
  TemplateNode,
  PageSpec,
  NodeType,
  Binding,
  Value,
} from './primitives/ast';
export { NODE_TYPES, PAGE_MODES, PAGE_SIZES } from './primitives/ast';
export type { Condition } from './primitives/condition';
export type { StyleRef, ResolvedStyle } from './primitives/style';
export { ALLOWED_STYLE_KEYS, ALLOWED_FONT_WEIGHTS, LENGTH_KEYS, PX_TO_PT } from './primitives/style';
export type {
  CompileResult,
  Diagnostic,
  EditAnchor,
  ResolvedNode,
  ResolvedPage,
  SectionEditor,
} from './primitives/ir';
export { compile, UNHANDLED_SECTIONS } from './primitives/compile';
export { validateTemplate } from './primitives/validate';
export { templateJsonSchema } from './primitives/schema';
export { normalizeStyles } from './primitives/normalize';
export { compileTreeComponent } from './primitives/treeComponent';
export { defaultSectionPreset } from './primitives/presets/defaultSection';
export type { PresetTokens, DefaultSectionParams } from './primitives/presets/defaultSection';
export { renderNode as renderTreeNodeDom } from './primitives/dom/renderNode';

/** 设计模式：对模板树的补丁操作（纯函数、不可变、可撤销）。 */
export {
  findNode,
  isNodeHidden,
  moveNode,
  outlineOf,
  removeNode,
  setNodeHidden,
  setNodeStyle,
  setNodeText,
} from './primitives/edit';
export type { OutlineEntry } from './primitives/edit';
export type { DomRenderContext } from './primitives/dom/renderNode';
