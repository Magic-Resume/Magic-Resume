import type { GenUIDataSource } from '@magic-resume/genui';

/**
 * Option lists the GenUI search fields query.
 *
 * Every one of them is lazy: the dictionaries are dynamic `import()`s,
 * triggered the first time a field using them is focused. A card the user never opens costs nothing, and none of this
 * lands in the main bundle.
 *
 * All of them are advisory. `SearchPick` submits whatever the user typed, so a
 * name that isn't in the list is a few keystrokes, not a dead end. That is also
 * why there is no `companies` source here: its only list was the hosted content
 * library, and a company field without hints is still a working field.
 */
const fromStrings = (load: () => Promise<string[]>): GenUIDataSource => ({
  load: async () => (await load()).map((value) => ({ value, label: value })),
});

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
};
