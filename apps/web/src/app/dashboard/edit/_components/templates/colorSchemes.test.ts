import assert from 'node:assert/strict';
import { test } from 'node:test';
import { magicTemplates } from '@magic-resume/resume-templates/config/magic-templates';
import { extractCustomConfig, mergeTemplateConfig } from '@/lib/utils/templateUtils';
import { COLOR_SCHEMES, colorsForScheme, haveSameColors, isDarkPaper, matchesColorScheme, resetTemplateColors } from './colorSchemes';

const classic = magicTemplates.classic;

test('a scheme is custom when a body color changes, even if its accent still matches', () => {
  const scheme = COLOR_SCHEMES[0];
  const colors = colorsForScheme(scheme, classic.designTokens.colors);
  assert.equal(matchesColorScheme(scheme, colors, classic.designTokens.colors), true);
  assert.equal(matchesColorScheme(scheme, { ...colors, text: '#000000' }, classic.designTokens.colors), false);
  assert.equal(matchesColorScheme(scheme, { ...colors, border: '#EFEFEF' }, classic.designTokens.colors), false);
});

test('optional sidebar colors follow templates that expose a sidebar', () => {
  const withoutSidebar = { ...classic.designTokens.colors };
  delete withoutSidebar.sidebar;
  assert.equal(colorsForScheme(COLOR_SCHEMES[0], withoutSidebar).sidebar, undefined);
  assert.equal(colorsForScheme(COLOR_SCHEMES[0], { ...withoutSidebar, sidebar: '#111111' }).sidebar, '#24416A');
  const legacyOverride = { ...colorsForScheme(COLOR_SCHEMES[0], withoutSidebar), sidebar: '#111111' };
  assert.equal(matchesColorScheme(COLOR_SCHEMES[0], legacyOverride, withoutSidebar), false);
  assert.equal(colorsForScheme(COLOR_SCHEMES[0], withoutSidebar, legacyOverride).sidebar, '#24416A');
});

test('dark schemes retain the paper and body colors used by fixed white template text', () => {
  const base = magicTemplates.gengar.designTokens.colors;
  for (const scheme of COLOR_SCHEMES) {
    const colors = colorsForScheme(scheme, base);
    assert.equal(colors.background, base.background);
    assert.equal(colors.text, base.text);
    assert.equal(colors.textSecondary, base.textSecondary);
    assert.equal(matchesColorScheme(scheme, colors, base), true);
    assert.notEqual(colors.primary, scheme.colors.primary);
  }
});

test('restoring colors preserves other settings and removes optional color overrides after store round-trip', () => {
  const base = { ...classic, designTokens: { ...classic.designTokens, colors: { ...classic.designTokens.colors } } };
  delete base.designTokens.colors.accent;
  delete base.designTokens.colors.sidebar;
  const edited = {
    ...base,
    layout: { ...base.layout, padding: '38px' },
    designTokens: {
      ...base.designTokens,
      colors: { ...base.designTokens.colors, primary: '#805D3D', accent: '#FFFFFF', sidebar: '#111111' },
      typography: { ...base.designTokens.typography, lineHeight: 1.9 },
    },
  };
  const reset = resetTemplateColors(base, edited);
  const restored = mergeTemplateConfig(base, extractCustomConfig(base, reset));
  assert.deepEqual(restored.designTokens.colors, base.designTokens.colors);
  assert.equal(restored.layout.padding, '38px');
  assert.equal(restored.designTokens.typography.lineHeight, 1.9);
});

test('color equality accepts casing and short hex while detecting removed optional colors', () => {
  const colors = classic.designTokens.colors;
  assert.equal(haveSameColors({ ...colors, background: '#fff' }, { ...colors, background: '#FFFFFF' }), true);
  assert.equal(haveSameColors(colors, { ...colors, sidebar: '#123456' }), false);
  assert.equal(isDarkPaper('#111827'), true);
  assert.equal(isDarkPaper('#fff'), false);
});

test('all light paper schemes provide at least 4.5:1 contrast for heading and body text', () => {
  const luminance = (hex: string) => {
    const linear = [1, 3, 5].map((index) => {
      const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  for (const scheme of COLOR_SCHEMES) {
    for (const key of ['primary', 'text', 'textSecondary'] as const) {
      const ratio = (luminance(scheme.colors.background) + 0.05) / (luminance(scheme.colors[key]) + 0.05);
      assert.ok(ratio >= 4.5, `${scheme.id}.${key}: ${ratio.toFixed(2)}:1`);
    }
  }
});
