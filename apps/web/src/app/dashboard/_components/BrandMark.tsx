'use client';

import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * The product logomark — the Kenmet brand mark, shared with the Astro
 * marketing site (apps/landing). Rendered as a clean point of light on the black
 * workbench: no tile, no border, just the mark scaled to `size`.
 */
export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('relative grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/magic-resume-mark.png"
        alt=""
        width={size}
        height={size}
        className="object-contain"
        priority
      />
    </span>
  );
}

/** Wordmark set in the brand typeface (Sora via --font-brand): 知遇 in Chinese,
 *  Kenmet in English — one name per language, never both. */
export function BrandWordmark({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('select-none whitespace-nowrap text-mr-subtitle leading-none tracking-[-0.01em]', className)}
      style={{ fontFamily: 'var(--font-brand), system-ui, sans-serif' }}
    >
      <span className="font-bold text-neutral-50">{t('brand.name')}</span>
    </span>
  );
}
