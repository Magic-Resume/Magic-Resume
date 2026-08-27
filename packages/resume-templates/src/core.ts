/**
 * 纯函数子路径（`@magic-resume/resume-templates/core`）。
 *
 * **不碰 React、不碰渲染器**——整条链上只有 `lodash.get` 一个依赖。
 * 给 agent-service 这类需要校验/编译模板、但绝不该为此拖进 react-dom + react-pdf
 * 的消费方用。
 *
 * 复刻闭环的五项检查里有四项在这里（结构、覆盖、绑定、兜底），
 * 只有「放不放得下」需要渲染器，那一项由调用方注入 `measure`。
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
export { ALLOWED_STYLE_KEYS, ALLOWED_FONT_WEIGHTS } from './primitives/style';
export type { CompileResult, Diagnostic, ResolvedNode, ResolvedPage } from './primitives/ir';
export { compile, UNHANDLED_SECTIONS } from './primitives/compile';
export { validateTemplate } from './primitives/validate';
export { templateJsonSchema } from './primitives/schema';
export { normalizeStyles } from './primitives/normalize';
export {
  REPLICATE_INSTRUCTIONS,
  critiqueTemplate,
  replicateTemplate,
} from './primitives/replicate';
export type {
  CritiqueKind,
  CritiqueProblem,
  CritiqueReport,
  CritiqueOptions,
  MeasureFn,
  RenderMeasurement,
  GenerateFn,
  GenerateRequest,
  ReplicateOptions,
  ReplicateResult,
} from './primitives/replicate';
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
export { defaultSectionPreset } from './primitives/presets/defaultSection';
export type { PresetTokens, DefaultSectionParams } from './primitives/presets/defaultSection';
export { techDensePreset, TECH_DENSE_TOKENS } from './primitives/presets/techDense';
export type { TechDenseTokens, TechDenseParams } from './primitives/presets/techDense';
