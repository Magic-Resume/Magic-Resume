import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge, twJoin } from 'tailwind-merge';

const TEXT_FAMILIES = [
  'large-title',
  'display-1',
  'display-2',
  'display-3',
  'display-4',
  'title-1',
  'title-2',
  'title-3',
  'headline',
  'body',
  'body-2',
  'caption-1',
  'caption-2',
  'mr-label',
  'mr-body',
  'mr-body-medium',
  'mr-caption',
  'mr-overline',
  'mr-ui',
  'mr-subtitle',
  'mr-body-tight',
  'mr-label-tight',
  'mr-micro',
  'mr-micro-plus',
  'mr-tiny',
  'mr-micro-small',
  'mr-tiny-plus',
  'mr-nano',
  'mr-title',
] as const;
const TEXT_WEIGHTS = ['regular', 'medium', 'semibold', 'bold'] as const;
const TEXT_STYLE_SUFFIXES = TEXT_FAMILIES.flatMap((family) =>
  TEXT_WEIGHTS.map((weight) => `${family}-${weight}`),
);
const TEXT_CLASS_NAMES = [...TEXT_FAMILIES, ...TEXT_STYLE_SUFFIXES];

const mergeClasses = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: TEXT_CLASS_NAMES }] } },
});

/**
 * Join classes that are selected by one module and are known not to conflict.
 * This keeps the hot path cheap and makes variant conflicts explicit.
 */
export function cxJoin(...inputs: ClassValue[]) {
  return twJoin(clsx(inputs));
}

/** Merge a module's defaults with an external className override. */
export function cx(...inputs: ClassValue[]) {
  return mergeClasses(clsx(inputs));
}

export const cn = cx;

export function sortCx<
  T extends Record<
    string,
    | string
    | number
    | Record<string, string | number | Record<string, string | number>>
  >,
>(classes: T): T {
  return classes;
}
