'use client';

import type { ButtonHTMLAttributes, Ref } from 'react';
import { cx } from '../cx.js';
import {
  switchThumbVariants,
  switchTrackVariants,
  type SwitchVariantProps,
} from '../recipes/switch.js';

export interface SwitchProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'>,
    SwitchVariantProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ref?: Ref<HTMLButtonElement>;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  size,
  className,
  onClick,
  ref,
  ...props
}: SwitchProps) {
  const thumbOffset = size === 'sm' ? 2 : 2;
  const thumbTravel = size === 'sm' ? 16 : 20;

  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!disabled && !event.defaultPrevented) onCheckedChange(!checked);
      }}
      className={cx(switchTrackVariants({ size, checked }), className)}
    >
      <span
        aria-hidden="true"
        className={cx(switchThumbVariants({ size, checked }))}
        style={{
          transform: `translateX(${checked ? thumbTravel : thumbOffset}px)`,
        }}
      />
    </button>
  );
}
