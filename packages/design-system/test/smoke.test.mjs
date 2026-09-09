import assert from 'node:assert/strict';
import test from 'node:test';
import { cx } from '../dist/cx.js';
import {
  buttonVariants,
  badgeVariants,
  fieldVariants,
  menuItemVariants,
  selectItemVariants,
  selectTriggerVariants,
  surfaceVariants,
} from '../dist/recipes/index.js';

test('recipes expose stable semantic variants', () => {
  const primary = buttonVariants({ variant: 'primary', size: 'lg' });
  assert.match(primary, /bg-mr-accent/);
  assert.match(primary, /h-10/);
  assert.match(primary, /mr-press-motion/);

  const invalidField = fieldVariants({ size: 'sm', invalid: true });
  assert.match(invalidField, /border-mr-danger/);
  assert.match(invalidField, /h-8/);

  assert.match(menuItemVariants({ tone: 'danger' }), /text-mr-danger-muted/);
  assert.match(badgeVariants({ tone: 'success' }), /bg-mr-success\/10/);
  assert.match(
    surfaceVariants({ tone: 'overlay', padding: 'lg' }),
    /backdrop-blur/,
  );

  assert.match(selectTriggerVariants({ size: 'sm' }), /h-8/);
  assert.match(selectItemVariants(), /mr-focus-ring/);
});

test('cx keeps custom typography utilities in one merge group', () => {
  const merged = cx('text-mr-body text-mr-title', 'text-mr-body-medium');
  assert.match(merged, /text-mr-body-medium/);
  assert.doesNotMatch(merged, /text-mr-title/);
});
