import { cva, type VariantProps } from 'class-variance-authority';

export const fieldVariants = cva('mr-field flex min-w-0 py-2 text-mr-body', {
  variants: {
    size: {
      sm: 'h-8 px-2.5',
      md: 'h-9 px-3',
      lg: 'h-10 px-3.5',
    },
    invalid: {
      true: 'border-mr-danger focus-visible:border-mr-danger focus-visible:ring-mr-danger/25',
      false: '',
    },
  },
  defaultVariants: {
    size: 'md',
    invalid: false,
  },
});

export type FieldVariantProps = VariantProps<typeof fieldVariants>;
