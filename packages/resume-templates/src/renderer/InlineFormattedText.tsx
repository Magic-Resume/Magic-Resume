import React from 'react';
import { hasInlineFormatting, parseInlineText, type InlineTextNode } from '../inlineFormatting';

function render(nodes: InlineTextNode[]): React.ReactNode[] {
  return nodes.map((node, index) => typeof node === 'string'
    ? node
    : React.createElement(node.tag, { key: index }, node.tag === 'br' ? undefined : render(node.children)));
}

/** Safe on the client and during SSR: no HTML insertion or DOM dependency. */
export function InlineFormattedText({ value }: { value: string }) {
  const content = render(parseInlineText(value));
  // Skill labels are often bold in the template. Explicit inline formatting
  // needs a regular base so selected emphasis remains visually meaningful.
  return hasInlineFormatting(value) ? <span style={{ fontWeight: 400 }}>{content}</span> : <>{content}</>;
}
