import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { useResumeStore, type ResumeState } from '@/store/useResumeStore';

export type ResumeDomainStore<T> = UseBoundStore<StoreApi<T>>;

/**
 * Transitional domain boundary around the legacy resume facade.
 *
 * The document remains the authoritative source while consumers migrate. Each
 * domain store exposes only its own state/actions and mirrors changes from the
 * facade, so new code no longer depends on the 1,400-line aggregate surface.
 */
export function createResumeDomainStore<T extends Record<string, unknown>>(
  select: (state: ResumeState) => T,
): ResumeDomainStore<T> {
  const store = create<T>(() => select(useResumeStore.getState()));
  let previous = store.getState();

  useResumeStore.subscribe((state) => {
    const next = select(state);
    const keys = Object.keys(next) as Array<keyof T>;
    const changed =
      keys.length !== Object.keys(previous).length ||
      keys.some((key) => !Object.is(previous[key], next[key]));
    if (!changed) return;
    previous = next;
    store.setState(next);
  });

  return store;
}
