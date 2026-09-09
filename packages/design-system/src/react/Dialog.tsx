import type { HTMLAttributes, Ref } from 'react';
import { cx } from '../cx.js';
import { modalContent, modalOverlay } from '../recipes/modal.js';

export function DialogOverlay({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cx(modalOverlay, className)}
      {...props}
    />
  );
}

export function DialogSurface({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      ref={ref}
      className={cx(modalContent, className)}
      {...props}
    />
  );
}
