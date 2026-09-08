import { cva, type VariantProps } from 'class-variance-authority';

export const surfaceVariants = cva('mr-surface', {
  variants: {
    tone: {
      default: '',
      inset: 'border-mr-line bg-mr-sunk shadow-none',
      overlay: 'border-mr-line-strong bg-mr-overlay backdrop-blur-xl',
    },
    padding: {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    },
  },
  defaultVariants: {
    tone: 'default',
    padding: 'md',
  },
});

export type SurfaceVariantProps = VariantProps<typeof surfaceVariants>;
