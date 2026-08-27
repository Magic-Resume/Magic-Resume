'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@magic-resume/utils';
import { DURATION, EASE_ENTER } from './tokens';
import { cardVariants, itemVariants } from './variants';

/**
 * 卡片的密度——**按需要多少注意力分，不按功能分**。
 *
 * 功能会一直增加，注意力档位不会。所以「不是七种卡片，是一种卡片的三种密度」。
 */
export type WidgetDensity =
  /** 一句话结论 + 一个动作。面试入口、模板选择这类 */
  | 'row'
  /** 结构化信息，需要读几眼。岗位研究、投递追踪这类 */
  | 'block'
  /** 需要独占注意力的一次严肃阅读。求职画像将属于这一档 */
  | 'plane';

/** 内容确实更宽时用 `wide`，而不是手写 `max-w-*` 数值。 */
export type WidgetWidth = 'default' | 'wide';

/** 圆角与底色三档一致：那是「这是一张卡」的身份，不该随密度变。 */
const DENSITY_CLASS: Record<WidgetDensity, string> = {
  row: 'px-4 py-2.5',
  block: 'px-4 py-3.5',
  plane: 'px-5 py-4.5',
};

const WIDTH_CLASS: Record<WidgetDensity, Record<WidgetWidth, string>> = {
  row: { default: 'min-w-[280px] max-w-md', wide: 'min-w-[320px] max-w-xl' },
  block: { default: 'min-w-[280px] max-w-md', wide: 'min-w-[320px] max-w-xl' },
  plane: { default: 'min-w-[320px] max-w-2xl', wide: 'min-w-[320px] max-w-2xl' },
};

/**
 * The animated frame every GenUI card sits in, so no card hand-rolls its own
 * variants and they can't drift apart.
 *
 * It owns three things: the entry, the stagger context its children opt into
 * via {@link WidgetItem}, and the height change when a card resolves and
 * collapses into a one-line summary — the moment that keeps a long
 * conversation from filling up with forms already filled in.
 *
 * **外壳样式也在这里**（`density` / `width`）。此前那串
 * `rounded-2xl bg-raised px-4 py-3.5` 被六张卡各抄一遍，改一处只改一处；而两张卡
 * 悄悄偏离了约定（一张手写更宽的 `max-w-xl`，一张根本没有外壳）。调用方现在**不该再写
 * 任何 `rounded-*` / `bg-*` / `px-*`**。
 *
 * Wrap in `<AnimatePresence>` at the call site if the card can be removed;
 * without one the exit variant never plays.
 */
export function WidgetShell({
  children,
  className,
  density = 'block',
  width = 'default',
  surface = true,
}: {
  children: React.ReactNode;
  /** 只用于布局微调（如 `flex-1`）。**别拿它传外观**——那正是这次要收掉的东西。 */
  className?: string;
  density?: WidgetDensity;
  width?: WidgetWidth;
  /**
   * 孩子自带卡壳时置 false：只保留入场动效与 stagger，不再画第二层底色内边距。
   *
   * `beautiful/*` 那一族**全部**自带 `rounded-card bg-surface shadow-card`，
   * 套进默认外壳就是卡中卡——一个 380px 的卡被一个 445px 的相框裱起来。
   */
  surface?: boolean;
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
      className={cn(
        'flex-1',
        WIDTH_CLASS[density][width],
        surface && 'rounded-2xl bg-raised',
        surface && DENSITY_CLASS[density],
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

/**
 * 卡片内部需要与卡底色区分的嵌套块。
 *
 * 内部原来是完全自由的：`ResearchBriefCard` 用了 5 种块样式，多数卡 3 种，
 * `rounded-lg/md/xl/full` 与 `bg-sunk/tint-sky/paper` 随手混用。收敛成两种原语——
 * {@link WidgetItem}（无底色，只有间距与 stagger）与这个（有底色）。
 *
 * ⚠️ **`bg-tint-sky` 不再作块底色**：它现在同时扮演「可点」和「一块信息」，
 * 两种语义压在一个颜色上。留给动作（按钮）。
 */
export function WidgetPanel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      variants={itemVariants(reduce)}
      className={cn('rounded-xl bg-sunk px-3 py-2.5', className)}
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
