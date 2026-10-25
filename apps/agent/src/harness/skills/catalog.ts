import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const metadataSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  description: z.string().min(1),
  'allowed-tools': z.union([z.string(), z.array(z.string())]),
});
export function parseSkill(source: string) {
  const match = /^---\r?\n([\s\S]+?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) throw new Error('Skill frontmatter is required');
  const meta = metadataSchema.parse(parse(match[1]));
  return {
    name: meta.name,
    description: meta.description,
    allowedTools:
      typeof meta['allowed-tools'] === 'string'
        ? meta['allowed-tools'].split(/[\s,]+/).filter(Boolean)
        : meta['allowed-tools'],
  };
}
export const SEARCH_SKILLS = new Set(['company-research', 'job-research']);
export function loadSkillCatalog(directory: string, searchEnabled = false) {
  const catalog = new Map<string, ReturnType<typeof parseSkill>>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!searchEnabled && SEARCH_SKILLS.has(entry.name)) continue;
    const meta = parseSkill(
      readFileSync(join(directory, entry.name, 'SKILL.md'), 'utf8'),
    );
    if (meta.name !== entry.name || catalog.has(meta.name))
      throw new Error('Skill names must be unique and match their directories');
    catalog.set(meta.name, meta);
  }
  return catalog;
}
export const MODE_SKILL: Readonly<Record<string, string>> = {
  create: 'resume-creation',
  optimize: 'resume-optimization',
  analyze: 'resume-analysis',
  fit: 'job-fit',
  translate: 'resume-translation',
};
