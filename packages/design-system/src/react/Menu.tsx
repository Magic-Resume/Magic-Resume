import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx.js';
import {
  menuItemVariants,
  type MenuItemVariantProps,
} from '../recipes/menu.js';

export interface MenuItemProps
  extends
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'>,
    MenuItemVariantProps {}

export function MenuItem({
  className,
  tone,
  disabled,
  ...props
}: MenuItemProps) {
  return (
    <button
      type="button"
      className={cx(menuItemVariants({ tone, disabled }), className)}
      disabled={disabled ?? undefined}
      {...props}
    />
  );
}
