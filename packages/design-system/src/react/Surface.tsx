import type { ButtonHTMLAttributes, HTMLAttributes, Ref } from 'react';
import { cx } from '../cx.js';
import {
  surfaceVariants,
  type SurfaceVariantProps,
} from '../recipes/surface.js';

export interface SurfaceProps
  extends HTMLAttributes<HTMLDivElement>, SurfaceVariantProps {
  ref?: Ref<HTMLDivElement>;
}

export function Surface({
  className,
  tone,
  padding,
  ref,
  ...props
}: SurfaceProps) {
  return (
    <div
      ref={ref}
      className={cx(surfaceVariants({ tone, padding }), className)}
      {...props}
    />
  );
}

export function IconButton({
  className,
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={cx(
        'mr-focus-ring mr-press-motion rounded-mr-control text-mr-ink-secondary hover:bg-mr-sunk hover:text-mr-ink inline-flex items-center justify-center',
        size === 'sm' ? 'size-8' : 'size-9',
        className,
      )}
      {...props}
    />
  );
}
