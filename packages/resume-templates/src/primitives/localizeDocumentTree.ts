import type { Resume } from '@magic-resume/resume-schema';
import { resolveSectionTitle } from '../sectionSemantics';
import type { ResolvedNode } from './ir';

/** Translate semantic headings once, before the shared IR reaches HTML or PDF. */
export function localizeDocumentTree(
  root: ResolvedNode,
  resume: Record<string, unknown>,
  locale?: string,
): ResolvedNode {
  const data = resume as unknown as Resume;
  const visit = (node: ResolvedNode, sectionKey?: string): ResolvedNode => {
    if (node.type === 'Box') {
      const key = node.editor?.sectionKey ?? sectionKey;
      return {
        ...node,
        ...(node.editor
          ? {
              editor: {
                ...node.editor,
                title: resolveSectionTitle(
                  key,
                  node.editor.title,
                  data,
                  locale,
                ),
              },
            }
          : {}),
        children: node.children.map((child) => visit(child, key)),
      };
    }
    // Free-form literals have no section identity, so preserve the author's wording.
    if (node.type === 'Text' && node.role === 'sectionHeading' && sectionKey) {
      return {
        ...node,
        text: resolveSectionTitle(sectionKey, node.text, data, locale),
      };
    }
    return node;
  };
  return visit(root);
}
