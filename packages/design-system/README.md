# Magic Resume design system

The design system is the shared visual contract for `apps/web`, `apps/landing`,
and workspace UI packages. It intentionally owns tokens, recipes, and small
presentational primitives; product state and Radix/React Aria behaviour stay in
the consuming feature module.

## Usage

```tsx
import { Button, Field, Input, buttonVariants } from '@magic-resume/design-system';
```

Import the CSS contract once from each app entrypoint:

```css
@import '@magic-resume/design-system/styles/tokens.css';
@import '@magic-resume/design-system/styles/utilities.css';
@import '@magic-resume/design-system/styles/motion.css';
```

Use static recipe maps for stateful variants. Keep one-off layout utilities in
the feature component, and use `cx` only when a caller-provided `className` is
allowed to override a recipe. `cxJoin` is for internal, non-conflicting class
composition.

`apps/web/src/components/ui` is the Web behaviour-adapter boundary; new shared
visual primitives should import from this package directly.
