import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'mr-focus-ring mr-press-motion inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-sans select-none disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'bg-mr-accent text-mr-accent-ink hover:bg-mr-accent-hover',
        secondary:
          'border border-mr-line bg-mr-surface text-mr-ink hover:border-mr-line-strong hover:bg-mr-sunk',
        ghost: 'text-mr-ink-secondary hover:bg-mr-sunk hover:text-mr-ink',
        danger: 'bg-mr-danger text-mr-danger-ink hover:bg-mr-danger-hover',
      },
      size: {
        sm: 'h-8 rounded-mr-control px-2.5 text-mr-body-medium',
        md: 'h-9 rounded-mr-control px-3 text-mr-body-medium',
        lg: 'h-10 rounded-mr-control px-4 text-mr-body-medium',
        icon: 'size-9 rounded-mr-control',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
