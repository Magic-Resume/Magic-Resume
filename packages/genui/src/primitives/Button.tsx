'use client';

import { ButtonHTMLAttributes } from 'react';

/**
 * 药丸按钮。**逐行取自 beautiful-ui `components/atoms/Button.tsx`**。
 *
 * 它用到的 6 个色板令牌（canvas / hover-2 / inset / accent-ink / green / line-strong）
 * 本仓都已有同名映射，所以原样搬即可——不要把类名换成本仓别名：同名令牌在两个仓里
 * 可以指向不同底色（`--color-field` 就是个教训），改写过一次就再难对回上游。
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'accent'
  | 'success';
type Size = 'sm' | 'md';

/** 实心按钮顶部那道 1px 高光，让它看起来是"凸起"而不是一块色板。 */
const filledShadow = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]';

const variants: Record<ButtonVariant, string> = {
  primary: `bg-ink text-canvas hover:opacity-90 dark:bg-ink dark:text-canvas ${filledShadow}`,
  secondary: 'bg-surface text-ink shadow-btn hover:bg-inset aria-expanded:bg-hover',
  ghost: 'bg-hover-2 text-ink hover:bg-line-strong',
  accent: `bg-accent text-white hover:bg-accent-ink ${filledShadow}`,
  success: `bg-green text-white hover:brightness-95 ${filledShadow}`,
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-[7px] text-[13px] leading-none rounded-full gap-1.5',
  md: 'px-4 py-[9px] text-sm leading-none rounded-full gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: Size;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium select-none
        transition-[transform,background-color,opacity] duration-150 ease-out
        active:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
