import * as React from 'react';
import {
  buttonVariants as designButtonVariants,
  cx,
} from '@magic-resume/design-system';
import { Loader2 } from '@magic-resume/icons';

type LegacyVariant = 'default' | 'outline' | 'ghost' | 'link';
type LegacySize = 'default' | 'sm' | 'lg' | 'icon';

const variantMap = {
  default: 'primary',
  outline: 'secondary',
  ghost: 'ghost',
  link: 'ghost',
} as const;

const sizeMap = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'icon',
} as const;

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: LegacyVariant;
  size?: LegacySize;
  className?: string;
} = {}) {
  return cx(
    designButtonVariants({ variant: variantMap[variant], size: sizeMap[size] }),
    variant === 'link' && 'text-mr-accent underline-offset-4 hover:underline',
    className,
  );
}

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    Partial<{
      variant: LegacyVariant;
      size: LegacySize;
    }> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, loading, disabled, children, ...props },
    ref,
  ) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={loading || disabled}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button };
