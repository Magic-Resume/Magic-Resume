import type { MagicTemplateDSL } from '../types/magic-dsl';
import type { TemplateDocument, TemplateNode } from './ast';

export type TreeTemplateStyleContext = Pick<MagicTemplateDSL, 'designTokens' | 'layout'>;

const cssPixels = (value: string): number | undefined => {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|pt|rem|em|mm)?$/);
  if (!match) return undefined;
  const scale = { px: 1, pt: 4 / 3, rem: 16, em: 16, mm: 96 / 25.4 };
  return Number(match[1]) * (scale[match[2] as keyof typeof scale] ?? 1);
};

/** 先把主题变量解析成两端都理解的值，PDF 无法读取浏览器 CSS 变量。 */
export function resolveTreeTemplateStyles(
  tree: TemplateDocument,
  { designTokens, layout }: TreeTemplateStyleContext,
): TemplateDocument {
  const variables: Record<string, string | number | undefined> = {};
  const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  for (const [name, value] of Object.entries(designTokens.colors)) {
    variables[`color-${kebab(name)}`] = value;
  }
  for (const [name, value] of Object.entries(designTokens.typography.fontSize)) {
    variables[`font-size-${name}`] = cssPixels(value);
  }
  for (const [name, value] of Object.entries(designTokens.spacing)) {
    variables[`spacing-${name}`] = cssPixels(value);
  }
  variables['line-height'] = designTokens.typography.lineHeight ?? 1.5;
  variables['letter-spacing'] = cssPixels(designTokens.typography.letterSpacing ?? '0');
  variables['title-divider-width'] = layout.showTitleDivider === false ? 0 : 1;
  variables['container-gap'] = cssPixels(layout.gap);

  const resolveStyle = (style: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(style).map(([property, value]) => {
      const reference = typeof value === 'string' ? value.match(/^var\(--([\w-]+)\)$/) : null;
      return [property, reference ? variables[reference[1]] ?? value : value];
    }));

  const visit = (node: TemplateNode): TemplateNode => ({
    ...node,
    ...(node.style ? { style: node.style.map((style) => typeof style === 'string' ? style : resolveStyle(style)) } : {}),
    ...(node.type === 'Box' ? {
      children: node.children?.map(visit),
      ...(node.separator ? { separator: visit(node.separator) } : {}),
    } : {}),
    ...(node.fallback && node.fallback !== 'drop' ? { fallback: visit(node.fallback) } : {}),
  });

  return {
    ...tree,
    ...(tree.styles ? { styles: Object.fromEntries(Object.entries(tree.styles).map(([name, style]) => [name, resolveStyle(style)])) } : {}),
    root: visit(tree.root),
  };
}
