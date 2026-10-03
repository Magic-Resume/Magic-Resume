'use client';

import { useId, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, RotateCcw } from '@magic-resume/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ColorField } from './ColorField';
import {
  ACCENT_PRESETS, BORDER_PRESETS, COLOR_SCHEMES, DARK_PAPER_PRESETS, LIGHT_TEXT_PRESETS, PAPER_PRESETS,
  SECONDARY_TEXT_PRESETS, TEXT_PRESETS, colorsForScheme, matchesColorScheme,
  haveSameColors, isDarkPaper, type TemplateColors,
} from './colorSchemes';

interface ColorSettingsProps {
  colors: TemplateColors;
  baseColors: TemplateColors;
  onChange: (colors: Partial<TemplateColors>) => void;
  onReset: () => void;
  canReset: boolean;
}

export default function ColorSettings({ colors, baseColors, onChange, onReset, canReset }: ColorSettingsProps) {
  const { t } = useTranslation();
  const id = useId();
  const reduceMotion = useReducedMotion();
  const [advanced, setAdvanced] = useState(false);
  const darkPaper = isDarkPaper(colors.background);
  const selected = COLOR_SCHEMES.find((scheme) => matchesColorScheme(scheme, colors, baseColors));
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 34, mass: 0.7 };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
          <span className="text-mr-overline font-medium text-mr-muted">
            {t('templateCustomizer.colors.schemes')}
          </span>
          <span className="text-[11px] text-mr-muted">
            {!selected && t(haveSameColors(colors, baseColors) ? 'templateCustomizer.colors.defaultScheme' : 'templateCustomizer.colors.customScheme')}
          </span>
        </div>
        <LayoutGroup id={id}>
          <div className="grid grid-cols-6 gap-1" role="group" aria-label={t('templateCustomizer.colors.schemes')}>
            {COLOR_SCHEMES.map((scheme) => {
              const active = selected?.id === scheme.id;
              const name = t(`templateCustomizer.colors.schemeNames.${scheme.id}`);
              const palette = colorsForScheme(scheme, baseColors, colors);
              return (
                <motion.button
                  key={scheme.id}
                  type="button"
                  title={name}
                  aria-pressed={active}
                  aria-label={name}
                  onClick={() => onChange(palette)}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  transition={transition}
                  className="group flex min-w-0 flex-col items-center gap-2 rounded-lg py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-mr-focus"
                >
                  <span className="relative flex aspect-square w-full max-w-11 items-center justify-center">
                    {active && (
                      <motion.span
                        layoutId="scheme-selection"
                        transition={transition}
                        className="pointer-events-none absolute inset-0 rounded-full border border-mr-ink-secondary/70"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className="relative flex size-[82%] items-center justify-center rounded-full border border-black/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.16)]"
                      style={{ backgroundColor: palette.primary }}
                    >
                      <AnimatePresence initial={false}>
                        {active && (
                          <motion.span
                            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.6 }}
                            transition={{ duration: reduceMotion ? 0 : 0.16 }}
                            style={{ color: isDarkPaper(palette.primary) ? '#FFFFFF' : '#20242B' }}
                          ><Check size={15} strokeWidth={2} /></motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </span>
                  <span className={cn('w-full truncate text-center text-[11px] leading-4 transition-colors duration-150 motion-reduce:transition-none', active ? 'font-medium text-mr-ink' : 'text-mr-muted group-hover:text-mr-ink-secondary')}>{name}</span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-mr-overline font-medium text-mr-muted">{t('templateCustomizer.colors.customColors')}</span>
          <button
            type="button"
            onClick={onReset}
            disabled={!canReset}
            title={t('templateCustomizer.colors.resetColors')}
            aria-label={t('templateCustomizer.colors.resetColors')}
            className="-mr-1 flex min-h-6 items-center gap-1 rounded-md px-1 text-[11px] text-mr-muted outline-none transition-colors hover:text-mr-ink focus-visible:ring-2 focus-visible:ring-mr-focus disabled:pointer-events-none disabled:opacity-35 motion-reduce:transition-none"
          >
            <RotateCcw size={11} />{t('templateCustomizer.colors.resetShort')}
          </button>
        </div>
        <div className="space-y-1">
          <ColorField label={t('templateCustomizer.colors.primary')} value={colors.primary} onChange={(primary) => onChange({ primary })} presets={darkPaper ? COLOR_SCHEMES.map((scheme) => colorsForScheme(scheme, { ...baseColors, background: colors.background }).primary) : ACCENT_PRESETS} />
          <ColorField label={t('templateCustomizer.colors.text')} value={colors.text} onChange={(text) => onChange({ text })} presets={darkPaper ? LIGHT_TEXT_PRESETS : TEXT_PRESETS} />
          <ColorField label={t('templateCustomizer.colors.textSecondary')} value={colors.textSecondary} onChange={(textSecondary) => onChange({ textSecondary })} presets={darkPaper ? LIGHT_TEXT_PRESETS : SECONDARY_TEXT_PRESETS} />
          {colors.sidebar !== undefined && <ColorField label={t('templateCustomizer.colors.sidebar')} value={colors.sidebar} onChange={(sidebar) => onChange({ sidebar })} presets={COLOR_SCHEMES.map(({ colors: palette }) => palette.sidebar)} />}
        </div>
        <div className="mt-2 border-t border-mr-line-soft pt-1.5">
          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
            aria-controls={`${id}-advanced`}
            className="flex min-h-9 w-full items-center justify-between gap-3 rounded-md text-mr-overline text-mr-muted outline-none transition-colors hover:text-mr-ink-secondary focus-visible:ring-2 focus-visible:ring-mr-focus motion-reduce:transition-none"
          >
            {t('templateCustomizer.colors.advanced')}
            <motion.span animate={{ rotate: advanced ? 180 : 0 }} transition={transition}><ChevronDown size={13} /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {advanced && (
              <motion.div
                key="advanced"
                id={`${id}-advanced`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: { duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: reduceMotion ? 0 : 0.16 } }}
                className="overflow-hidden"
              >
                <div className="space-y-1 pt-1">
                  <ColorField label={t('templateCustomizer.colors.border')} value={colors.border} onChange={(border) => onChange({ border })} presets={darkPaper ? ['#374151', '#475569', '#52525B', '#57534E'] : BORDER_PRESETS} />
                  <ColorField label={t('templateCustomizer.colors.background')} value={colors.background} onChange={(background) => onChange({ background })} presets={darkPaper ? DARK_PAPER_PRESETS : PAPER_PRESETS} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
