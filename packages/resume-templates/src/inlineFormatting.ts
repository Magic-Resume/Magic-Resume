/** Text fields support inline emphasis without interpreting arbitrary HTML. */
export const INLINE_FORMAT_TAGS = ['strong', 'b', 'em', 'i', 'u', 's', 'br'] as const;
type InlineTag = (typeof INLINE_FORMAT_TAGS)[number];
export type InlineTextNode = string | { tag: InlineTag; children: InlineTextNode[] };

export function hasInlineFormatting(value: string): boolean {
  return /<(?:strong|b|em|i|u|s|br)(?:\s[^<>]*|\s*\/?)>/i.test(value);
}

function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (entity, key: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
    if (key[0] !== '#') return named[key.toLowerCase()] ?? entity;
    const point = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

/** Only recognized tags are structural; attributes and other tags never execute. */
export function parseInlineText(value: string): InlineTextNode[] {
  if (!hasInlineFormatting(value)) return [value];
  const root: InlineTextNode[] = [];
  const stack: { tag?: InlineTag; children: InlineTextNode[] }[] = [{ children: root }];
  // Do not scan across a new tag opener: malformed repeated "<b " input
  // otherwise makes the attribute match rescan the remainder quadratically.
  const tokens = /<\/?(strong|b|em|i|u|s|br)(?:\s[^<>]*|\s*\/?)>/gi;
  let offset = 0;
  for (const match of value.matchAll(tokens)) {
    const text = value.slice(offset, match.index);
    if (text) stack.at(-1)!.children.push(decodeEntities(text));
    const tag = match[1].toLowerCase() as InlineTag;
    if (match[0].startsWith('</')) {
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].tag === tag) {
          stack.length = index;
          break;
        }
      }
    } else {
      const node = { tag, children: [] as InlineTextNode[] };
      stack.at(-1)!.children.push(node);
      if (tag !== 'br') stack.push(node);
    }
    offset = match.index + match[0].length;
  }
  const tail = value.slice(offset);
  if (tail) stack.at(-1)!.children.push(decodeEntities(tail));
  return root;
}
