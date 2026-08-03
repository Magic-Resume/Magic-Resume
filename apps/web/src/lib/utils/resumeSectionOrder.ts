import type { SectionOrder } from '@/types/frontend/resume';

const DEFAULT_SECTION_ORDER: SectionOrder[] = [
  { key: 'basics', label: 'Basics' },
  { key: 'projects', label: 'sections.projects' },
  { key: 'education', label: 'sections.education' },
  { key: 'skills', label: 'sections.skills' },
  { key: 'languages', label: 'sections.languages' },
  { key: 'certificates', label: 'sections.certificates' },
  { key: 'experience', label: 'sections.experience' },
];

const DEFAULT_LABELS = new Map(DEFAULT_SECTION_ORDER.map((item) => [item.key, item.label]));

/**
 * Keys the app owns — a superset of `DEFAULT_SECTION_ORDER`, which is only the
 * order to restore. They differ by `profiles`: it ships in `defaultResume` and
 * templates render it, but its editor form is disabled, so it must stay
 * undeletable without being re-added to every resume.
 */
const BUILT_IN_SECTION_KEYS = new Set<string>([
  'basics',
  ...DEFAULT_SECTION_ORDER.map((item) => item.key),
  'profiles',
]);

const fallbackLabel = (key: string) =>
  DEFAULT_LABELS.get(key) ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : key);

/**
 * `sectionOrder` also controls which forms exist in the editor. AI-generated
 * resumes may only order sections they found content for, so repair the order
 * without disturbing the sequence or labels it did provide.
 */
export function normalizeResumeSectionOrder(
  sectionOrder: SectionOrder[] | null | undefined,
  sections: Record<string, unknown> | null | undefined,
): SectionOrder[] {
  const normalized: SectionOrder[] = [];
  const seen = new Set<string>();

  const add = (item: SectionOrder) => {
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    if (!key || seen.has(key) || key === 'basics') return;

    seen.add(key);
    const entry: SectionOrder = {
      key,
      label: typeof item.label === 'string' && item.label.trim()
        ? item.label
        : fallbackLabel(key),
    };
    // Rebuilding as a bare {key,label} dropped this, and every drag / write /
    // dirty check runs through here — so a chosen icon never survived.
    if (typeof item.icon === 'string' && item.icon.trim()) entry.icon = item.icon;
    normalized.push(entry);
  };

  for (const item of sectionOrder ?? []) add(item);
  for (const item of DEFAULT_SECTION_ORDER) add(item);
  for (const key of Object.keys(sections ?? {})) add({ key, label: fallbackLabel(key) });

  return [{ key: 'basics', label: 'Basics' }, ...normalized];
}

/**
 * A section the app did not define — imported from a resume, or created by the
 * user.
 *
 * The distinction is load-bearing: only these can be renamed or deleted. A
 * built-in section's label is an i18n key (`sections.skills`), so renaming one
 * would replace a translated string with a literal and break every other
 * language; and deleting one would take away a form the editor expects.
 */
export function isCustomSection(key: string): boolean {
  return !BUILT_IN_SECTION_KEYS.has(key);
}

/**
 * A stable, collision-free key for a new custom section.
 *
 * Derived from the title so the JSON stays readable, but never trusted to be
 * unique or even non-empty — a title can be Chinese, punctuation, or a
 * duplicate of an existing section.
 */
export function customSectionKey(
  title: string,
  existingKeys: Iterable<string>,
): string {
  // Seeded with the built-ins: callers pass `Object.keys(sections)`, which never
  // holds `basics`, so a section titled "Basics" used to mint that reserved key.
  const taken = new Set([...BUILT_IN_SECTION_KEYS, ...existingKeys]);
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const base = slug || 'section';

  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}-${n++}`;
  return key;
}
