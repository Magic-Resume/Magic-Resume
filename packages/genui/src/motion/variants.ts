import type { Variants } from 'framer-motion';
import { DURATION, EASE_ENTER, EASE_EXIT, ENTER_OFFSET, STAGGER_STEP } from './tokens';

/**
 * Card enter / exit, with the children stagger that makes a card read as
 * "the options are being laid out" rather than "a form appeared".
 *
 * `reduce` is not a smaller version of the same animation — under
 * prefers-reduced-motion every translate is dropped and only opacity remains,
 * which is the part that carries "something new is here".
 */
export function cardVariants(reduce: boolean): Variants {
  return {
    initial: { opacity: 0, y: reduce ? 0 : ENTER_OFFSET },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduce ? DURATION.micro : DURATION.card,
        ease: EASE_ENTER,
        staggerChildren: reduce ? 0 : STAGGER_STEP,
        delayChildren: reduce ? 0 : DURATION.element / 2,
      },
    },
    exit: {
      opacity: 0,
      y: reduce ? 0 : -4,
      transition: { duration: reduce ? DURATION.micro : DURATION.element, ease: EASE_EXIT },
    },
  };
}

/** A staggered child inside a card — a chip, a field row, a summary line. */
export function itemVariants(reduce: boolean): Variants {
  return {
    initial: { opacity: 0, y: reduce ? 0 : 4 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? DURATION.micro : DURATION.element, ease: EASE_ENTER },
    },
    exit: { opacity: 0, transition: { duration: DURATION.micro, ease: EASE_EXIT } },
  };
}
