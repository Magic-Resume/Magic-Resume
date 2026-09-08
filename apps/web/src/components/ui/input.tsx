import * as React from 'react';
import { Input as DesignInput } from '@magic-resume/design-system/react';

/** Compatibility export. New code should import Input from the design-system package. */
const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof DesignInput>
>(({ size = 'lg', ...props }, ref) => (
  <DesignInput ref={ref} size={size} {...props} />
));
Input.displayName = 'Input';

export { Input };
