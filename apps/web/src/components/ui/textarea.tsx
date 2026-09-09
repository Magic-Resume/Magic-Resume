import * as React from 'react';
import { Textarea as DesignTextarea } from '@magic-resume/design-system/react';

/** Compatibility export. New code should import Textarea from the design-system package. */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<typeof DesignTextarea>
>(({ className, ...props }, ref) => (
  <DesignTextarea ref={ref} className={className} {...props} />
));
Textarea.displayName = 'Textarea';

export { Textarea };
