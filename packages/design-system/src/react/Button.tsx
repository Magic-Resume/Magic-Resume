import type { ButtonHTMLAttributes, Ref } from 'react';
import { buttonVariants, type ButtonVariantProps } from '../recipes/button.js';
import { cx } from '../cx.js';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonVariantProps {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
