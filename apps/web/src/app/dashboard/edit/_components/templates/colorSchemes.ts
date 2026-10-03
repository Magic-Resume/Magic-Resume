import type { MagicTemplateDSL } from '@magic-resume/resume-templates/types/magic-dsl';

export type TemplateColors = MagicTemplateDSL['designTokens']['colors'];

export const COLOR_SCHEMES = [
  { id: 'blue', colors: { primary: '#3B6BD6', secondary: '#24416A', accent: '#3B6BD6', text: '#242A33', textSecondary: '#626B78', background: '#FFFFFF', border: '#DCE3EC', sidebar: '#24416A' } },
  { id: 'graphite', colors: { primary: '#536071', secondary: '#29313B', accent: '#536071', text: '#252A31', textSecondary: '#626A75', background: '#FFFFFF', border: '#DFE3E8', sidebar: '#29313B' } },
  { id: 'forest', colors: { primary: '#34785B', secondary: '#244A3D', accent: '#34785B', text: '#26332D', textSecondary: '#626E67', background: '#FFFFFF', border: '#DCE6DF', sidebar: '#244A3D' } },
  { id: 'ocean', colors: { primary: '#2C7789', secondary: '#1D4957', accent: '#2C7789', text: '#253139', textSecondary: '#606C73', background: '#FFFFFF', border: '#DCE6E9', sidebar: '#1D4957' } },
  { id: 'umber', colors: { primary: '#986B40', secondary: '#59412C', accent: '#986B40', text: '#332C26', textSecondary: '#73685F', background: '#FFFDFA', border: '#E8E0D6', sidebar: '#59412C' } },
  { id: 'wine', colors: { primary: '#9F4F68', secondary: '#603442', accent: '#9F4F68', text: '#342A2E', textSecondary: '#73636A', background: '#FFFFFF', border: '#E8DDE1', sidebar: '#603442' } },
] as const satisfies ReadonlyArray<{ id: string; colors: TemplateColors }>;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const ACCENT_PRESETS = COLOR_SCHEMES.map(({ colors }) => colors.primary);
export const TEXT_PRESETS = ['#20242B', '#334155', '#536071', '#57534E', '#626B78', '#73685F'];
export const SECONDARY_TEXT_PRESETS = ['#475569', '#57534E', '#626B78', '#6B7280', '#73685F', '#767676'];
export const BORDER_PRESETS = ['#CBD5E1', '#DCE3EC', '#DFE3E8', '#DCE6DF', '#E8E0D6', '#E8DDE1'];
export const PAPER_PRESETS = ['#FFFFFF', '#FFFDFA', '#FAFAF9', '#F8FAFC', '#F5F7FA', '#F3F6F4'];
export const LIGHT_TEXT_PRESETS = ['#FFFFFF', '#F9FAFB', '#F1F5F9', '#E2E8F0', '#D1D5DB', '#CBD5E1'];
export const DARK_PAPER_PRESETS = ['#111827', '#171717', '#1E293B', '#1F2937', '#242A33', '#292524'];
const DARK_ACCENTS = { blue: '#9FBDE6', graphite: '#C5CCD5', forest: '#9FCDB8', ocean: '#99CAD8', umber: '#D8BE9E', wine: '#D7AAB9' };

export function isDarkPaper(color: string): boolean {
  const normalized = normalizeColor(color);
  if (!/^#[0-9a-f]{6}$/.test(normalized)) return false;
  const linear = [1, 3, 5].map((index) => {
    const channel = parseInt(normalized.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722 < 0.179;
}

const normalizeColor = (value: string) => {
  const hex = value.trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(hex)
    ? `#${[...hex.slice(1)].map((character) => character.repeat(2)).join('')}`
    : hex;
};

/** Sidebar is only added for templates that already expose a sidebar color. */
export function colorsForScheme(scheme: ColorScheme, base: TemplateColors, current: TemplateColors = base): TemplateColors {
  const { sidebar, ...colors } = scheme.colors;
  const palette = isDarkPaper(base.background)
    ? { ...colors, primary: DARK_ACCENTS[scheme.id], secondary: DARK_ACCENTS[scheme.id], accent: DARK_ACCENTS[scheme.id], background: base.background, text: base.text, textSecondary: base.textSecondary, border: base.border }
    : colors;
  return base.sidebar === undefined && current.sidebar === undefined ? palette : { ...palette, sidebar };
}

export function matchesColorScheme(scheme: ColorScheme, current: TemplateColors, base: TemplateColors = current): boolean {
  return Object.entries(colorsForScheme(scheme, base, current)).every(
    ([key, color]) => normalizeColor(current[key as keyof TemplateColors] ?? '') === normalizeColor(color),
  );
}

export function haveSameColors(first: TemplateColors, second: TemplateColors): boolean {
  return Object.keys({ ...first, ...second }).every((key) => {
    const colorKey = key as keyof TemplateColors;
    return normalizeColor(first[colorKey] ?? '') === normalizeColor(second[colorKey] ?? '');
  });
}

/** Replace the complete color object so optional overrides are removed as well. */
export function resetTemplateColors(base: MagicTemplateDSL, current: MagicTemplateDSL): MagicTemplateDSL {
  return {
    ...current,
    designTokens: { ...current.designTokens, colors: { ...base.designTokens.colors } },
  };
}
