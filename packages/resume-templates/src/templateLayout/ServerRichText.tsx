import React from 'react';
import { parse, HTMLElement, TextNode, type Node } from 'node-html-parser';

const allowed = new Set(['p', 'div', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's', 'br', 'span']);
const discarded = new Set(['script', 'style', 'iframe', 'object', 'template']);

/** SSR has no DOMPurify window. Render a small, attribute-free React tree. */
export function ServerRichText({ html }: { html: string }) {
  const render = (nodes: Node[]): React.ReactNode[] => nodes.map((node, key) => {
    if (node instanceof TextNode) return node.text;
    if (!(node instanceof HTMLElement)) return null;
    const tag = node.rawTagName.toLowerCase();
    if (discarded.has(tag)) return null;
    const children = render(node.childNodes);
    if (!allowed.has(tag)) return <React.Fragment key={key}>{children}</React.Fragment>;
    return React.createElement(tag, { key }, tag === 'br' ? undefined : children);
  });
  return <>{render(parse(html).childNodes)}</>;
}
