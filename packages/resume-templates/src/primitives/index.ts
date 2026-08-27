/**
 * 可组合原语层的对外出口。
 *
 * 使用顺序固定：**校验 → 编译 → 渲染**。跳过校验直接编译不会崩（编译器自己也防御），
 * 但会失去「模板有问题」的诊断——而 AI 生成的模板正是靠这些诊断挡住的。
 */
export type {
  TemplateDocument,
  TemplateNode,
  Binding,
  EachSpec,
  Value,
} from './ast';
export type { Condition } from './condition';
export type { StyleRef, ResolvedStyle } from './style';
export type {
  ResolvedNode,
  EditAnchor,
  CompileResult,
  Diagnostic,
} from './ir';

export { validateTemplate, type ValidationResult } from './validate';
export { compile, UNHANDLED_SECTIONS } from './compile';
export { LIST_MARKERS, markerFor } from './listMarkers';
