import { cva, type VariantProps } from 'class-variance-authority';

export const switchTrackVariants = cva(
  'mr-focus-ring relative inline-flex shrink-0 items-center rounded-mr-pill outline-none transition-colors duration-200 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      size: {
        sm: 'h-5 w-9',
        md: 'h-6 w-11',
      },
      checked: {
        true: 'bg-mr-accent',
        false: 'bg-mr-sunk',
      },
    },
    defaultVariants: {
      size: 'md',
      checked: false,
    },
  },
);

export const switchThumbVariants = cva(
  'pointer-events-none block rounded-full bg-white shadow-mr-control transition-transform duration-200 motion-reduce:transition-none',
  {
    variants: {
      size: {
        sm: 'size-4',
        md: 'size-5',
      },
      checked: {
        true: '',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      checked: false,
    },
  },
);

export type SwitchVariantProps = VariantProps<typeof switchTrackVariants>;
