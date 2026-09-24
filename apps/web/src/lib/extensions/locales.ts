import type { ExtensionResources } from './contracts';

/**
 * Copy slot — translations that belong to what the other slots render.
 *
 * The commercial build replaces this module with the commercial billing
 * package's resources, and `src/i18n.ts` deep-merges them into its own before
 * `init`. Static data rather than `i18n.addResourceBundle` from overlay code:
 * resources registered at import time depend on module order relative to
 * `init`, and would differ between the server render and hydration if either
 * side loaded them late.
 *
 * Merged underneath, never over: a key here must not already exist in
 * `src/locales/*`. The commercial package's tests enforce that.
 *
 * Empty in this build — the open-source app renders nothing that needs it.
 */
export const extensionResources: ExtensionResources = { zh: {}, en: {} };
