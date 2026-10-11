import React from 'react';
import { Text } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { hasInlineFormatting, parseInlineText, type InlineTextNode } from '../inlineFormatting';

function render(nodes: InlineTextNode[]): React.ReactNode[] {
  return nodes.map((node, index) => {
    if (typeof node === 'string') return node;
    if (node.tag === 'br') return '\n';
    const style: Style = node.tag === 'strong' || node.tag === 'b' ? { fontWeight: 700 }
      : node.tag === 'em' || node.tag === 'i' ? { fontStyle: 'italic' }
      : { textDecoration: node.tag === 'u' ? 'underline' : 'line-through' };
    return <Text key={index} style={style}>{render(node.children)}</Text>;
  });
}

export function pdfInlineText(value: string): React.ReactNode[] {
  const content = render(parseInlineText(value));
  return hasInlineFormatting(value) ? [<Text key="inline-format" style={{ fontWeight: 400 }}>{content}</Text>] : content;
}
