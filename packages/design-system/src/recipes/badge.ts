import { cva, type VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
  'inline-flex items-center border font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-mr-line bg-mr-sunk text-mr-ink-secondary',
        accent: 'border-mr-accent/25 bg-mr-accent/10 text-mr-accent',
        success: 'border-mr-success/25 bg-mr-success/10 text-mr-success-ink',
        warning: 'border-mr-warning/25 bg-mr-warning/10 text-mr-warning-ink',
        danger: 'border-mr-danger/25 bg-mr-danger/10 text-mr-danger-muted',
      },
      size: {
        sm: 'h-5 rounded-mr-control px-1.5 text-mr-label',
        md: 'h-6 rounded-mr-control px-2 text-mr-body',
      },
      shape: {
        control: 'rounded-mr-control',
        pill: 'rounded-mr-pill',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      size: 'sm',
      shape: 'control',
    },
  },
);

export type BadgeVariantProps = VariantProps<typeof badgeVariants>;
