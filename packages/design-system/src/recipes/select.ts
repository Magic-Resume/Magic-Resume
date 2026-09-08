import { cva, type VariantProps } from 'class-variance-authority';

export const selectTriggerVariants = cva(
  'mr-focus-ring mr-press-motion inline-flex w-fit items-center justify-between gap-2 rounded-mr-control border border-mr-line bg-mr-surface px-3 py-2 text-mr-body whitespace-nowrap text-mr-ink shadow-mr-control outline-none transition-colors hover:border-mr-line-strong disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-mr-danger data-[placeholder]:text-mr-muted [&_svg:not([class*="text-"])]:text-mr-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      size: {
        default: 'h-9',
        sm: 'h-8',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export const selectContent =
  'mr-surface relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-x-hidden overflow-y-auto bg-mr-overlay text-mr-ink origin-(--radix-select-content-transform-origin)';

export const selectViewport = 'p-1';

export const selectLabel = 'px-2 py-1.5 text-mr-label text-mr-muted';

export const selectItemVariants = cva(
  'mr-focus-ring relative flex w-full cursor-default items-center gap-2 rounded-mr-control py-1.5 pr-8 pl-2 text-mr-body outline-none select-none focus:bg-mr-sunk focus:text-mr-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*="text-"])]:text-mr-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
);

export const selectItemIndicator =
  'absolute right-2 flex size-3.5 items-center justify-center';

export const selectSeparator = 'pointer-events-none -mx-1 my-1 h-px bg-mr-line';

export const selectScrollButton =
  'flex cursor-default items-center justify-center py-1 text-mr-muted';

export type SelectTriggerVariantProps = VariantProps<
  typeof selectTriggerVariants
>;
