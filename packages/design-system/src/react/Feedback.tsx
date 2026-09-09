import type { HTMLAttributes } from 'react';
import { cx } from '../cx.js';
import { badgeVariants } from '../recipes/badge.js';

export function Badge({
  className,
  tone,
  size,
  shape,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  shape?: 'control' | 'pill';
}) {
  return (
    <span
      className={cx(badgeVariants({ tone, size, shape }), className)}
      {...props}
    />
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'mr-motion-breathe rounded-mr-control bg-mr-sunk',
        className,
      )}
      {...props}
    />
  );
}

export function StatusPill({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'accent' | 'danger' | 'success';
}) {
  const toneClass = {
    neutral: 'bg-mr-sunk text-mr-ink-secondary',
    accent: 'bg-mr-accent/15 text-mr-accent',
    danger: 'bg-mr-danger/15 text-mr-danger-muted',
    success: 'bg-mr-success/15 text-mr-success-ink',
  }[tone];
  return (
    <span
      className={cx(
        'rounded-mr-pill text-mr-label inline-flex items-center px-2 py-0.5',
        toneClass,
        className,
      )}
      {...props}
    />
  );
}
