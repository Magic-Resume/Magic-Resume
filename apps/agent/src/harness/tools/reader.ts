import type { RunnableConfig } from '@langchain/core/runnables';
import { stripTags } from '../../text.js';
export type ResumeReader = (
  config?: RunnableConfig,
) => Promise<Record<string, unknown>>;
export function resumeMarkdown(resume: Record<string, unknown>): string {
  const lines: string[] = [];
  const skip = new Set([
    'id',
    'visible',
    'avatar',
    'icon',
    'created_at',
    'modified_at',
  ]);
  function visit(value: unknown, label: string, level: number) {
    if (
      value &&
      typeof value === 'object' &&
      'visible' in value &&
      value.visible === false
    )
      return;
    if (Array.isArray(value))
      value.forEach((item) => visit(item, label, level));
    else if (value && typeof value === 'object') {
      if (label) lines.push(`${'#'.repeat(Math.min(level, 4))} ${label}`);
      Object.entries(value)
        .filter(([key]) => !skip.has(key))
        .forEach(([key, item]) => visit(item, key, level + 1));
    } else if (value !== undefined && value !== null && String(value).trim()) {
      lines.push(
        `${label}: ${stripTags(String(value), ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .trim()}`,
      );
    }
  }
  visit(resume.info, '', 1);
  const sections =
    resume.sections && typeof resume.sections === 'object'
      ? (resume.sections as Record<string, unknown>)
      : {};
  const order = Array.isArray(resume.sectionOrder) ? resume.sectionOrder : [];
  const keys = [
    ...new Set([
      ...order.map((entry) =>
        typeof entry === 'string' ? entry : String(entry.key),
      ),
      ...Object.keys(sections),
    ]),
  ];
  keys.forEach((key) => visit(sections[key], key, 2));
  return lines.join('\n');
}
