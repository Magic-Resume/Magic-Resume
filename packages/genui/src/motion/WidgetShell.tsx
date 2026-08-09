'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { DURATION, EASE_ENTER } from './tokens';
import { cardVariants, itemVariants } from './variants';

/**
 * The animated frame every GenUI card sits in, so no card hand-rolls its own
 * variants and they can't drift apart.
 *
 * It owns three things: the entry, the stagger context its children opt into
 * via {@link WidgetItem}, and the height change when a card resolves and
 * collapses into a one-line summary — the moment that keeps a long
 * conversation from filling up with forms already filled in.
 *
 * Wrap in `<AnimatePresence>` at the call site if the card can be removed;
 * without one the exit variant never plays.
 */
export function WidgetShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      // `layout="position"`, never plain `layout`: framer animates a size change
      // by scaling the element, and scaled text renders blurry for the whole
      // animation — very visible on a card collapsing to its summary line.
      // Position-only keeps neighbouring messages sliding smoothly; the card's
      // own height is animated transform-free by the collapsing body (grid-rows).
      layout={reduce ? false : 'position'}
      variants={cardVariants(reduce)}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: reduce ? 0 : DURATION.settle, ease: EASE_ENTER }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * A child of {@link WidgetShell} that joins its stagger. Takes no props beyond
 * children so a card can wrap chips or field rows without thinking about
 * timing — the parent owns the rhythm.
 */
export function WidgetItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div variants={itemVariants(reduce)} className={className}>
      {children}
    </motion.div>
  );
}
