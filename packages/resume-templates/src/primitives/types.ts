/** 对外的类型出口。渲染后端只从这里 import——它们不该碰到 AST。 */
export type {
  ResolvedNode,
  ResolvedBox,
  ResolvedText,
  ResolvedRichText,
  ResolvedList,
  ResolvedImage,
  ResolvedIcon,
  EditAnchor,
  CompileResult,
  Diagnostic,
} from './ir';
export type { ResolvedStyle } from './style';
