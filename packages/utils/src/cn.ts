/**
 * Compatibility entrypoint for consumers that still import `cn` from utils.
 *
 * The implementation lives in the design-system package so typography-aware
 * Tailwind merging has one source of truth across web, landing, and GenUI.
 */
export { cx as cn } from '@magic-resume/design-system/cx';
