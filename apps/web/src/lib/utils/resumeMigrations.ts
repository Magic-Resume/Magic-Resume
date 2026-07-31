import type { Resume, Section, SectionItem } from '@/types/frontend/resume';

/**
 * Repairs applied to a resume on its way out of storage.
 *
 * Both of these exist because a resume saved by an older build is still a
 * resume someone is editing today — they cannot be fixed by changing what new
 * imports write.
 */

/**
 * `summary` is the only rich-text field the product uses: the editor binds its
 * rich-text box to it for every section, and of the thirteen templates only
 * `product-ops-focus` maps `description`. Imports written before that was
 * settled put prose in `description`, where it is stored, invisible in twelve
 * templates, and un-editable in all of them — the resume looks like the import
 * dropped it.
 *
 * `description` is left in place: `product-ops-focus` reads it, and removing a
 * key gains nothing.
 */
function preferSummary(item: SectionItem): SectionItem {
  const summary = item.summary;
  const description = item.description;
  const summaryEmpty = typeof summary !== 'string' || !summary.trim();
  if (summaryEmpty && typeof description === 'string' && description.trim()) {
    return { ...item, summary: description };
  }
  return item;
}

function migrateSections(sections: Section | undefined): {
  sections: Section;
  changed: boolean;
} {
  const source = sections ?? ({} as Section);
  let changed = false;

  const migrated = Object.fromEntries(
    Object.entries(source).map(([key, items]) => [
      key,
      (items ?? []).map((item) => {
        const next = preferSummary(item);
        if (next !== item) changed = true;
        return next;
      }),
    ]),
  ) as Section;

  return { sections: changed ? migrated : source, changed };
}

/**
 * Bring a stored resume up to what the current editor expects.
 *
 * Returns the original object when nothing needed changing, so callers can use
 * identity to avoid a pointless write and a spurious "modified" sync status.
 *
 * Replaces the two hand-written copies of the `basics` repair that used to sit
 * in either branch of `loadResumeForEdit` — one place is also one place to add
 * the next repair to.
 */
export function migrateResume(resume: Resume): Resume {
  const { sections, changed: sectionsChanged } = migrateSections(
    resume.sections,
  );

  // `basics` drives the editor's first form. A resume written before it existed
  // has no entry for it and opens without the name/contact fields.
  const hasBasics = (resume.sectionOrder ?? []).some((s) => s.key === 'basics');

  if (!sectionsChanged && hasBasics) return resume;

  return {
    ...resume,
    sections,
    sectionOrder: hasBasics
      ? resume.sectionOrder
      : [{ key: 'basics', label: 'Basics' }, ...(resume.sectionOrder ?? [])],
  };
}
