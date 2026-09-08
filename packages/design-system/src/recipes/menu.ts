import { cva, type VariantProps } from 'class-variance-authority';

export const menuItemVariants = cva(
  'mr-focus-ring flex w-full items-center gap-2 rounded-mr-control px-2.5 py-2 text-left text-mr-body outline-none transition-colors',
  {
    variants: {
      tone: {
        default: 'text-mr-ink-secondary hover:bg-mr-sunk hover:text-mr-ink',
        active: 'bg-mr-sunk text-mr-ink',
        danger:
          'text-mr-danger-muted hover:bg-mr-danger/10 hover:text-mr-danger-hover',
      },
      disabled: {
        true: 'cursor-not-allowed opacity-50',
        false: 'cursor-pointer',
      },
    },
    defaultVariants: {
      tone: 'default',
      disabled: false,
    },
  },
);

export type MenuItemVariantProps = VariantProps<typeof menuItemVariants>;
