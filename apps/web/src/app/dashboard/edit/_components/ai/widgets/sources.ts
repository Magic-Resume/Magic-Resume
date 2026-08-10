import type { GenUIDataSource, WidgetOption } from '@magic-resume/genui/contract';
import { fetchTimelines } from '@/lib/api/knowledge';

/**
 * Option lists the GenUI search fields query.
 *
 * Every one of them is lazy: the dictionaries are dynamic `import()`s and the
 * remote one is a single fetch, both triggered the first time a field using
 * them is focused. A card the user never opens costs nothing, and none of this
 * lands in the main bundle.
 *
 * All of them are advisory. `SearchPick` submits whatever the user typed, so a
 * name that isn't in the list is a few keystrokes, not a dead end.
 */
const fromStrings = (load: () => Promise<string[]>): GenUIDataSource => ({
  load: async () => (await load()).map((value) => ({ value, label: value })),
});

/**
 * Companies come from the recruiting timelines in the content library rather
 * than a list we maintain: those are real, current employer names, and they
 * carry an industry we can show as a disambiguating hint.
 */
async function loadCompanies(): Promise<WidgetOption[]> {
  // One generous page: this is an autocomplete hint list, not a directory, and
  // paging through everything to populate a dropdown is not worth the wait.
  const page = await fetchTimelines({ current: 1, size: 200 });
  const seen = new Map<string, WidgetOption>();
  for (const item of page.items) {
    const value = item.company?.trim();
    if (!value || seen.has(value)) continue;
    seen.set(value, { value, label: value, hint: item.industry });
  }
  return [...seen.values()];
}

export const AI_WIDGET_SOURCES: Record<string, GenUIDataSource> = {
  roles: fromStrings(() =>
    import('@/lib/constants/dictionaries/roles').then((m) => m.ROLES),
  ),
  majors: fromStrings(() =>
    import('@/lib/constants/dictionaries/majors').then((m) => m.MAJORS),
  ),
  schools: fromStrings(() =>
    import('@/lib/constants/dictionaries/schools').then((m) => m.SCHOOLS),
  ),
  companies: { load: loadCompanies },
};
