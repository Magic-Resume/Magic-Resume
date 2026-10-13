import { ENTITY } from '../data/entity';
import en from './en.json';
import zh from './zh.json';

export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * `meta.description` is the entity definition, not free copy: it comes from
 * data/entity.ts so it cannot drift from README, web metadata and the docs.
 */
function withEntity<T extends { meta: object }>(copy: T, locale: Locale) {
  return { ...copy, meta: { ...copy.meta, description: ENTITY[locale].short } };
}

const dictionaries = { en: withEntity(en, 'en'), zh: withEntity(zh, 'zh') };

/** The copy dictionary for a locale (typed against the English source). */
export type Copy = typeof dictionaries.en;

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function getCopy(locale: Locale): Copy {
  return dictionaries[locale] as Copy;
}

/** Extract the locale from an Astro URL like `/zh/...`; falls back to default. */
export function getLocaleFromUrl(url: URL): Locale {
  const seg = url.pathname.split('/').filter(Boolean)[0];
  return isLocale(seg) ? seg : DEFAULT_LOCALE;
}

/** Replace `{name}` placeholders in a string. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export const localeLabels: Record<Locale, string> = {
  en: 'EN',
  zh: '中文',
};
